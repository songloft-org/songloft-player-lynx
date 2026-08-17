import { useEffect, useRef, useState } from '@lynx-js/react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { Icon, ICON_COLORS } from '../../../shared/ui/Icon.js'
import { getSongsApi } from '../../library/api/index.js'
import {
  useCancelMetadataRefreshMutation,
  useCancelScanMutation,
  useDirectoryTree,
  useMetadataProgressQuery,
  useScanCompletionEffect,
  useScanProgressQuery,
  useStartMetadataRefreshMutation,
  useStartScanMutation,
} from '../data/index.js'
import { SettingsRow } from '../../settings/widgets/SettingsRow.js'
import { SettingsSection } from '../../settings/widgets/SettingsSection.js'
import { toggleSelected } from '../domain/directory-tree.js'
import { metadataPollInterval, scanPollInterval } from '../domain/scan-model.js'
import type { ScanMode } from '../domain/scan-model.js'
import { ExcludeDirSection } from '../widgets/ExcludeDirSection.js'
import { MetadataSection } from '../widgets/MetadataSection.js'
import { ScanSection } from '../widgets/ScanSection.js'
import { ScanSettingsSection } from '../widgets/ScanSettingsSection.js'
import './LibraryOpsPage.css'

/**
 * Music-library operations sub-page (`/settings/library`, inside the shell) —
 * batch 19, exclude-directory management added in batch 26. Replaces the
 * long-standing disabled "Music library scan" placeholder in Settings.
 *
 * Ported from the Flutter `ScanManager` + `MetadataRefreshManager` +
 * `ExcludeDirManager` (`features/settings/presentation/widgets/`). Deliberately
 * **not** ported: duplicate detection and cache management (see PROGRESS for
 * their batch assignment).
 *
 * All ephemeral state lives here rather than in a store: it is page-scoped, and
 * a module-level store would leak the previous visit's selection (or a previous
 * server's directory listing) into the next one.
 */
export function LibraryOpsPage() {
  const navigate = useNavigate()
  const { t } = useTranslation()

  const [mode, setMode] = useState<ScanMode>('skip')
  const [selectedPaths, setSelectedPaths] = useState<string[]>([])
  const [startError, setStartError] = useState(false)
  const [writeError, setWriteError] = useState(false)
  /**
   * Sticky "we just asked for a scan" flag. The backend may still answer `idle`
   * on the first poll after accepting the job, and a purely data-derived
   * interval would then never start. Cleared once a terminal state arrives.
   */
  const [scanForced, setScanForced] = useState(false)
  const [scanPaused, setScanPaused] = useState(false)
  const [metaForced, setMetaForced] = useState(false)
  const [metaPaused, setMetaPaused] = useState(false)
  const [cleaning, setCleaning] = useState(false)
  const [cleanResult, setCleanResult] = useState<string | null>(null)
  // "I have read the last run's summary" — see `deriveScanView`. Local only: the
  // server keeps reporting that summary forever, so nothing else can express it.
  const [scanDismissed, setScanDismissed] = useState(false)

  // Both queries fetch on mount and are then re-fetched by the explicit poll
  // effects below — query-core's `refetchInterval` is unreliable on this Lynx
  // build (see the doc block in `data/scan-query.ts`).
  const scanQuery = useScanProgressQuery()
  const metaQuery = useMetadataProgressQuery()
  const progress = scanQuery.data
  const metaProgress = metaQuery.data

  useScanCompletionEffect(progress)

  /**
   * Explicit progress polls, mirroring `DuplicateCheckPage` (batch 29b/40).
   *
   * `scanPollInterval` / `metadataPollInterval` remain the single source of truth
   * for the poll decision: they return the period in ms while the job is live and
   * `false` once it is terminal (or paused for the cancel handshake). Deriving a
   * **primitive** delay and depending on that — rather than on the `progress`
   * object — matters: the object gets a new identity on every poll response, so
   * depending on it would tear down and re-arm the interval on every tick.
   */
  const scanDelay = scanPollInterval(progress, scanForced, scanPaused)
  const refetchScan = scanQuery.refetch
  useEffect(() => {
    if (scanDelay === false) return
    const id = setInterval(() => {
      void refetchScan()
    }, scanDelay)
    return () => clearInterval(id)
  }, [scanDelay, refetchScan])

  const metaDelay = metadataPollInterval(metaProgress, metaForced, metaPaused)
  const refetchMeta = metaQuery.refetch
  useEffect(() => {
    if (metaDelay === false) return
    const id = setInterval(() => {
      void refetchMeta()
    }, metaDelay)
    return () => clearInterval(id)
  }, [metaDelay, refetchMeta])

  const startScan = useStartScanMutation()
  const cancelScan = useCancelScanMutation()
  const startMeta = useStartMetadataRefreshMutation()
  const cancelMeta = useCancelMetadataRefreshMutation()

  const { tree, actions: treeActions } = useDirectoryTree()

  /**
   * Drop the sticky poll flags once the server reports a terminal state **that is
   * newer than the start** — the same guard `DuplicateCheckPage` uses.
   *
   * Without the freshness check, starting a run right after a finished one cleared
   * the flag against the *previous* run's terminal status (the GET is a
   * round-trip, so for a moment the cache still holds it). Combined with the poll
   * decision that used to short-circuit on terminal, the effect was: tap "refresh
   * again" → no progress bar, stale result on screen, job running invisibly.
   */
  const scanStartedAtRef = useRef(0)
  const metaStartedAtRef = useRef(0)
  const scanTerminalIsFresh = scanQuery.dataUpdatedAt >= scanStartedAtRef.current
  const metaTerminalIsFresh = metaQuery.dataUpdatedAt >= metaStartedAtRef.current

  useEffect(() => {
    if (progress?.isTerminal && scanTerminalIsFresh) setScanForced(false)
  }, [progress?.isTerminal, scanTerminalIsFresh])
  useEffect(() => {
    if (metaProgress?.isDone && metaTerminalIsFresh) setMetaForced(false)
  }, [metaProgress?.isDone, metaTerminalIsFresh])

  const onStartScan = () => {
    setStartError(false)
    // A new run owns the area again; the previous summary is gone either way.
    setScanDismissed(false)
    startScan.mutate(
      { reimport: mode === 'reimport', paths: selectedPaths },
      {
        onSuccess: () => {
          scanStartedAtRef.current = Date.now()
          setScanForced(true)
        },
        onError: () => setStartError(true),
      },
    )
  }

  /**
   * Cancel handshake, both orderings ported from the Flutter reference:
   * pause polling **before** sending the request (a poll landing mid-flight can
   * read the terminal state and jump the UI forward), and un-pause on failure —
   * the job may still be running, and a frozen progress bar is worse than a
   * failed cancel.
   */
  const onCancelScan = () => {
    setScanPaused(true)
    cancelScan.mutate(undefined, {
      onSuccess: () => setScanPaused(false),
      onError: () => {
        setScanPaused(false)
        setStartError(true)
      },
    })
  }

  /**
   * "Scan again" returns to the idle controls; it does **not** start a scan.
   *
   * It used to fire one immediately, on the reasoning that "rescan means do it
   * now". That quietly cost the user every choice the idle state offers: the
   * skip/reimport mode and the target directories. Worse, it made them
   * *unreachable* — the progress endpoint keeps reporting the last run's terminal
   * status, so the summary is what you land on even after a remount, and the only
   * way out was this button, which then scanned with whatever mode local state
   * happened to hold (`skip` on a fresh mount). Reimport could not be picked at
   * all. The Flutter reference's button only calls `reset()`, which is what this
   * mirrors: acknowledge the result, get the controls back, choose, then start.
   */
  const onResetScan = () => {
    setStartError(false)
    setScanForced(false)
    setScanDismissed(true)
  }

  const onStartMeta = () => {
    startMeta.mutate(undefined, {
      onSuccess: () => {
        metaStartedAtRef.current = Date.now()
        setMetaForced(true)
      },
      onError: () => setWriteError(true),
    })
  }

  const onCancelMeta = () => {
    setMetaPaused(true)
    cancelMeta.mutate(undefined, {
      onSuccess: () => setMetaPaused(false),
      onError: () => {
        setMetaPaused(false)
        setWriteError(true)
      },
    })
  }

  return (
    <view className='libops'>
      <view className='libops__topbar'>
        <view
          className='libops__back'
          bindtap={() => void navigate({ to: '/settings' })}
          data-testid='libops-back'
        >
          <Icon name='chevron-down' size={22} color={ICON_COLORS.content} />
        </view>
        <text className='libops__title'>{t('libops.pageTitle')}</text>
      </view>

      <scroll-view className='libops__scroll' scroll-y>
        <view className='libops__content'>
          {/* Lynx has no toast/snackbar primitive, so write failures surface as
              a dismissible inline banner (the Flutter version used a snackbar). */}
          {writeError
            ? (
              <view className='libops__banner' data-testid='libops-write-error'>
                <Icon name='warning' size={18} color={ICON_COLORS.danger} />
                <text className='libops__banner-text'>{t('libops.saveFailed', { error: '' })}</text>
                <view
                  className='libops__banner-close'
                  bindtap={() => setWriteError(false)}
                  data-testid='libops-write-error-dismiss'
                >
                  <Icon name='x' size={16} color={ICON_COLORS.content2} />
                </view>
              </view>
            )
            : null}

          <ScanSection
            progress={progress}
            startError={startError}
            starting={startScan.isPending}
            cancelling={cancelScan.isPending}
            mode={mode}
            onModeChange={setMode}
            dismissed={scanDismissed}
            selectedPaths={selectedPaths}
            onTogglePath={(path) => setSelectedPaths((prev) => toggleSelected(prev, path))}
            onClearPaths={() => setSelectedPaths([])}
            onStart={onStartScan}
            onCancel={onCancelScan}
            onReset={onResetScan}
            tree={tree}
            treeActions={treeActions}
          />

          <ScanSettingsSection onWriteError={() => setWriteError(true)} />

          <ExcludeDirSection onWriteError={() => setWriteError(true)} />

          <MetadataSection
            progress={metaProgress}
            starting={startMeta.isPending}
            cancelling={cancelMeta.isPending}
            onStart={onStartMeta}
            onCancel={onCancelMeta}
            onWriteError={() => setWriteError(true)}
          />

          {/*
            These two were hand-rolled bare cards (`.libops__dup-entry`): no
            horizontal margin, so they sat 32px wider than every `SettingsSection`
            card above them; 12px of vertical padding against the 16px a
            `.settings-row` uses; their own border each, so the pair showed a
            doubled hairline where they met; and no section header. Rendering them
            through the same section/row widgets as the rest of the page is what
            makes them line up.
          */}
          <SettingsSection title={t('libops.maintenanceSection')} icon='settings'>
            <SettingsRow
              icon='fingerprint'
              title={t('libops.duplicateDetection')}
              trailingIcon='chevron-right'
              onTap={() => void navigate({ to: '/settings/duplicates' })}
              testId='libops-duplicates'
            />
            <SettingsRow
              icon='stop'
              title={t('libops.cleanInvalid')}
              // The result used to be a loose line of text under the card; as the
              // row's own subtitle it reads as belonging to the action.
              subtitle={cleaning ? t('common.loading') : cleanResult ?? undefined}
              danger
              disabled={cleaning}
              onTap={() => {
                setCleaning(true)
                setCleanResult(null)
                void getSongsApi().cleanInvalidSongs()
                  .then(r => setCleanResult(t('libops.cleanResult', { count: r.cleaned })))
                  .catch(() => setCleanResult(t('libops.cleanFailed')))
                  .finally(() => setCleaning(false))
              }}
              testId='libops-clean-invalid'
            />
          </SettingsSection>
        </view>
      </scroll-view>
    </view>
  )
}
