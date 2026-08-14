import { useEffect, useState } from '@lynx-js/react'
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

  // Drop the sticky poll flags once the server reports a terminal state.
  useEffect(() => {
    if (progress?.isTerminal) setScanForced(false)
  }, [progress?.isTerminal])
  useEffect(() => {
    if (metaProgress?.isDone) setMetaForced(false)
  }, [metaProgress?.isDone])

  const onStartScan = () => {
    setStartError(false)
    startScan.mutate(
      { reimport: mode === 'reimport', paths: selectedPaths },
      {
        onSuccess: () => setScanForced(true),
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

  const onResetScan = () => {
    setStartError(false)
    setScanForced(false)
    void scanQuery.refetch()
  }

  const onStartMeta = () => {
    startMeta.mutate(undefined, {
      onSuccess: () => setMetaForced(true),
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

          <view
            className='libops__dup-entry'
            bindtap={() => void navigate({ to: '/settings/duplicates' })}
          >
            <Icon name='fingerprint' size={20} color={ICON_COLORS.primary} />
            <text className='libops__dup-entry-text'>{t('libops.duplicateDetection')}</text>
            <Icon name='chevron-right' size={16} color={ICON_COLORS.contentMuted} />
          </view>

          <view
            className='libops__dup-entry'
            bindtap={() => {
              if (cleaning) return
              setCleaning(true)
              setCleanResult(null)
              void getSongsApi().cleanInvalidSongs()
                .then(r => setCleanResult(t('libops.cleanResult', { count: r.cleaned })))
                .catch(() => setCleanResult(t('libops.cleanFailed')))
                .finally(() => setCleaning(false))
            }}
          >
            <Icon name='stop' size={20} color={ICON_COLORS.danger} />
            <text className='libops__dup-entry-text'>
              {cleaning ? t('common.loading') : t('libops.cleanInvalid')}
            </text>
          </view>
          {cleanResult
            ? <text className='libops__clean-result'>{cleanResult}</text>
            : null}
        </view>
      </scroll-view>
    </view>
  )
}
