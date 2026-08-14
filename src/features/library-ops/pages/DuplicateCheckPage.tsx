import { useEffect, useRef, useState } from '@lynx-js/react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { Icon, ICON_COLORS } from '../../../shared/ui/Icon.js'
import type { DuplicateGroup } from '../../../models/duplicate.js'
import {
  useFingerprintStatusQuery,
  useFingerprintProgressQuery,
  useStartFingerprintMutation,
  useCancelFingerprintMutation,
  useBatchDeleteMutation,
  useDuplicatesQuery,
} from '../data/index.js'
import {
  type DuplicatePagePhase,
  FINGERPRINT_POLL_MS,
  recommendedKeepId,
  countTotalToDelete,
  groupDeleteIds,
  allDeleteIds,
} from '../domain/fingerprint-model.js'
import { DeleteConfirmDialog } from '../widgets/DeleteConfirmDialog.js'
import { DuplicateGroupCard } from '../widgets/DuplicateGroupCard.js'
import { DuplicateResultsSection } from '../widgets/DuplicateResultsSection.js'
import { FingerprintComputingSection } from '../widgets/FingerprintComputingSection.js'
import { FingerprintStatusCard } from '../widgets/FingerprintStatusCard.js'
import './DuplicateCheckPage.css'

/**
 * Duplicate detection / fingerprint page — three-phase state machine:
 * 1. **Status** — show fingerprint stats + start/recompute actions
 * 2. **Computing** — poll progress + cancel
 * 3. **Results** — duplicate groups + clean actions
 *
 * Ported from Flutter's `DuplicateCheckPage` (`duplicate_check_page.dart`).
 */
export function DuplicateCheckPage() {
  const navigate = useNavigate()
  const { t } = useTranslation()

  // ── Phase state machine ────────────────────────────────────────────────────
  const [phase, setPhase] = useState<DuplicatePagePhase>('status')
  const [error, setError] = useState<string | null>(null)

  // ── Polling flags ──────────────────────────────────────────────────────────
  // Cancel handshake: pause the poll before sending the cancel request so a poll
  // landing mid-flight cannot read the terminal state and jump the UI forward.
  const [progressPaused, setProgressPaused] = useState(false)

  // ── Queries ────────────────────────────────────────────────────────────────
  const statusQuery = useFingerprintStatusQuery()
  // The progress query fetches once on mount (to auto-resume a computation that
  // is already running when the page opens) and then whenever the explicit poll
  // effect below calls `refetch()`. Its cadence is driven by that `setInterval`
  // rather than query-core's `refetchInterval`, which proved unreliable on this
  // Lynx build (batch 29b — the interval callback stopped firing after the first
  // fetch, freezing the count while the backend advanced).
  const progressQuery = useFingerprintProgressQuery()
  const [fetchDuplicates, setFetchDuplicates] = useState(false)
  const duplicatesQuery = useDuplicatesQuery(fetchDuplicates)

  const status = statusQuery.data
  const progress = progressQuery.data

  // ── Mutations ──────────────────────────────────────────────────────────────
  const startFingerprint = useStartFingerprintMutation()
  const cancelFingerprint = useCancelFingerprintMutation()
  const batchDelete = useBatchDeleteMutation()

  // ── Results state ──────────────────────────────────────────────────────────
  const [selectedKeep, setSelectedKeep] = useState<Map<number, number>>(new Map())
  const [ignoredGroups, setIgnoredGroups] = useState<Set<number>>(new Set())

  // ── Delete dialog ──────────────────────────────────────────────────────────
  const [deleteDialogShow, setDeleteDialogShow] = useState(false)
  const [deleteCount, setDeleteCount] = useState(0)
  const [deleteIds, setDeleteIds] = useState<number[]>([])

  // ── Auto-detect running computation on mount ───────────────────────────────
  useEffect(() => {
    if (progress?.isRunning && phase === 'status') {
      setPhase('computing')
    }
  }, [progress?.isRunning, phase])

  /**
   * Explicit progress poll — the reliable replacement for query-core's
   * `refetchInterval` (batch 29b).
   *
   * On this Lynx 4.0 build the functional `refetchInterval` stopped firing after
   * its first fetch: verified on device that `computed/total` froze at the first
   * value while the backend kept advancing, and the interval callback never ran
   * again even though the interval function kept returning `2000`. A plain
   * `setInterval` in the page **was** verified to fire every tick, so we drive
   * the poll ourselves: while computing and not paused, `refetch()` the progress
   * query every 2s. The interval tears down on leaving the computing phase, on
   * pause (the cancel handshake), and on unmount.
   */
  const refetchProgress = progressQuery.refetch
  useEffect(() => {
    if (phase !== 'computing' || progressPaused) return
    const id = setInterval(() => {
      void refetchProgress()
    }, FINGERPRINT_POLL_MS)
    return () => clearInterval(id)
  }, [phase, progressPaused, refetchProgress])

  /**
   * Ignore progress values fetched *before* the current computing run started.
   *
   * When the user starts a new run, the page flips to `computing` synchronously
   * while the cached progress may still hold the previous run's **terminal**
   * value (`done`/`cancelled`). The start mutation invalidates + refetches the
   * progress query, but that GET is a round-trip — for one render the computing
   * phase can still see the stale terminal progress. Without this guard the
   * finished-transition below would fire on that stale value and skip straight
   * to results (the batch 29b bug). We stamp the entry time on flipping to
   * `computing` and only honour a *finished* progress whose data was updated
   * after it.
   */
  const computingSinceRef = useRef(0)
  useEffect(() => {
    if (phase === 'computing') computingSinceRef.current = Date.now()
  }, [phase])

  // ── Auto-transition: computing → results when finished ─────────────────────
  useEffect(() => {
    const freshlyFinished =
      progress?.isFinished && progressQuery.dataUpdatedAt >= computingSinceRef.current
    if (freshlyFinished && phase === 'computing') {
      setFetchDuplicates(true)
      setPhase('results')
    }
  }, [progress?.isFinished, progressQuery.dataUpdatedAt, phase])

  // ── Pre-select recommended keeps when duplicates arrive ────────────────────
  useEffect(() => {
    if (duplicatesQuery.data && phase === 'results') {
      const newKeep = new Map<number, number>()
      for (let i = 0; i < duplicatesQuery.data.groups.length; i++) {
        newKeep.set(i, recommendedKeepId(duplicatesQuery.data.groups[i]))
      }
      setSelectedKeep(newKeep)
      setIgnoredGroups(new Set())
    }
  }, [duplicatesQuery.data, phase])

  // ── Handlers ───────────────────────────────────────────────────────────────

  const onStartCompute = (params?: { recomputeAll?: boolean; retryFailed?: boolean }) => {
    setError(null)
    startFingerprint.mutate(params, {
      onSuccess: () => setPhase('computing'),
      onError: (e) => setError(String(e)),
    })
  }

  const onCancel = () => {
    setProgressPaused(true)
    cancelFingerprint.mutate(undefined, {
      onSuccess: () => {
        setProgressPaused(false)
        setPhase('status')
        void statusQuery.refetch()
      },
      onError: (e) => {
        // Resume polling — the job may still be running.
        setProgressPaused(false)
        setError(String(e))
      },
    })
  }

  const onCheckDuplicates = () => {
    setFetchDuplicates(true)
    setPhase('results')
  }

  const onRecheck = () => {
    setPhase('status')
    setFetchDuplicates(false)
    setSelectedKeep(new Map())
    setIgnoredGroups(new Set())
    void statusQuery.refetch()
  }

  const onKeepChange = (groupIndex: number, songId: number) => {
    setSelectedKeep((prev) => {
      const next = new Map(prev)
      next.set(groupIndex, songId)
      return next
    })
  }

  const onToggleIgnore = (groupIndex: number) => {
    setIgnoredGroups((prev) => {
      const next = new Set(prev)
      if (next.has(groupIndex)) next.delete(groupIndex)
      else next.add(groupIndex)
      return next
    })
  }

  const onDeleteGroup = (groupIndex: number) => {
    const groups = duplicatesQuery.data?.groups
    if (!groups) return
    const group = groups[groupIndex]
    const keepId = selectedKeep.get(groupIndex) ?? recommendedKeepId(group)
    const ids = groupDeleteIds(group, keepId)
    if (ids.length === 0) return
    setDeleteIds(ids)
    setDeleteCount(ids.length)
    setDeleteDialogShow(true)
  }

  const onCleanAll = () => {
    const groups = duplicatesQuery.data?.groups
    if (!groups || groups.length === 0) return
    const ids = allDeleteIds(groups, selectedKeep, ignoredGroups)
    if (ids.length === 0) return
    setDeleteIds(ids)
    setDeleteCount(ids.length)
    setDeleteDialogShow(true)
  }

  const onConfirmDelete = () => {
    setDeleteDialogShow(false)
    batchDelete.mutate(
      { ids: deleteIds, deleteFiles: true },
      {
        onSuccess: () => {
          // Re-fetch duplicates after deletion
          setFetchDuplicates(true)
          void duplicatesQuery.refetch()
        },
        onError: (e) => setError(String(e)),
      },
    )
  }

  // ── Derived values ─────────────────────────────────────────────────────────
  const groups: DuplicateGroup[] = duplicatesQuery.data?.groups ?? []
  const totalToDelete = countTotalToDelete(groups, selectedKeep, ignoredGroups)

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <view className='dup-check'>
      <view className='dup-check__topbar'>
        <view
          className='dup-check__back'
          bindtap={() => void navigate({ to: '/settings' })}
          data-testid='dup-check-back'
        >
          <Icon name='chevron-down' size={22} color={ICON_COLORS.content} />
        </view>
        <text className='dup-check__title'>
          {t('libops.duplicateDetection')}
        </text>
      </view>

      <scroll-view className='dup-check__scroll' scroll-y>
        <view className='dup-check__content'>
          {/* Error banner */}
          {error
            ? (
              <view className='dup-check__error' data-testid='dup-check-error'>
                <Icon name='warning' size={18} color={ICON_COLORS.danger} />
                <text className='dup-check__error-text'>{error}</text>
                <view
                  className='dup-check__error-close'
                  bindtap={() => setError(null)}
                  data-testid='dup-check-error-dismiss'
                >
                  <Icon name='x' size={16} color={ICON_COLORS.content2} />
                </view>
              </view>
            )
            : null}

          {/* Status phase */}
          {phase === 'status' && status
            ? (
              <FingerprintStatusCard
                status={status}
                onStartCompute={() => onStartCompute()}
                onRetryFailed={() => onStartCompute({ retryFailed: true })}
                onRecomputeAll={() => onStartCompute({ recomputeAll: true })}
                onCheckDuplicates={onCheckDuplicates}
                starting={startFingerprint.isPending}
              />
            )
            : null}

          {/* Loading spinner when status is not yet available */}
          {phase === 'status' && !status && statusQuery.isLoading
            ? (
              <view className='dup-check__loading' data-testid='dup-check-loading'>
                <text className='dup-check__loading-text'>
                  {t('libops.dupLoading')}
                </text>
              </view>
            )
            : null}

          {/* Computing phase */}
          {phase === 'computing'
            ? (
              <FingerprintComputingSection
                progress={progress}
                totalFallback={status?.missing ?? 0}
                onCancel={onCancel}
                cancelling={cancelFingerprint.isPending}
              />
            )
            : null}

          {/* Results phase */}
          {phase === 'results'
            ? (
              <view data-testid='fp-results-phase'>
                {duplicatesQuery.isLoading
                  ? (
                    <view className='dup-check__loading' data-testid='fp-results-loading'>
                      <text className='dup-check__loading-text'>
                        {t('libops.dupLoadingResults')}
                      </text>
                    </view>
                  )
                  : null}

                {duplicatesQuery.data
                  ? (
                    <view>
                      <DuplicateResultsSection
                        duplicates={duplicatesQuery.data}
                        totalToDelete={totalToDelete}
                        ignoredCount={ignoredGroups.size}
                        onCleanAll={onCleanAll}
                        onRecheck={onRecheck}
                      />

                      {groups.map((group, i) => (
                        <DuplicateGroupCard
                          key={group.fingerprint || i}
                          groupIndex={i}
                          group={group}
                          keepId={selectedKeep.get(i) ?? recommendedKeepId(group)}
                          recommendedId={recommendedKeepId(group)}
                          ignored={ignoredGroups.has(i)}
                          onKeepChange={(songId) => onKeepChange(i, songId)}
                          onToggleIgnore={() => onToggleIgnore(i)}
                          onDeleteUnselected={() => onDeleteGroup(i)}
                        />
                      ))}
                    </view>
                  )
                  : null}
              </view>
            )
            : null}
        </view>
      </scroll-view>

      {/* Delete confirmation dialog */}
      <DeleteConfirmDialog
        show={deleteDialogShow}
        count={deleteCount}
        onConfirm={onConfirmDelete}
        onCancel={() => setDeleteDialogShow(false)}
      />
    </view>
  )
}
