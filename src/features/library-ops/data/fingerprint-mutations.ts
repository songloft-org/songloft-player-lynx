import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query'

import { getFingerprintApi } from '../api/index.js'
import { libopsQueryKeys } from './scan-query.js'

/**
 * Reset the fingerprint caches for a fresh compute run — **batch 29b bug fix**.
 *
 * Extracted as a plain function (like `remote-setting.ts`'s `applyOptimistic`)
 * so the cache side effects are unit-testable without rendering the mutation.
 *
 * Two things must happen the moment a new run starts:
 *
 * 1. **Invalidate the progress query.** When the page mounts, the progress query
 *    caches whatever the backend last reported — usually a *terminal* value
 *    (`done`/`cancelled`) from a previous run. If that stale terminal value is
 *    still cached when the page flips to the computing phase, the page's
 *    auto-transition effect (`progress.isFinished && phase === 'computing'`)
 *    fires immediately and skips straight past "computing" to "results" — the
 *    user never sees the progress bar (and on a never-computed library the count
 *    would otherwise stay frozen at `0/0`). Invalidation marks the stale value
 *    for refetch so the computing phase starts from fresh, non-terminal data.
 *    This mirrors what `useStartScanMutation` does — the piece the fingerprint
 *    start was originally missing.
 * 2. **Drop the duplicate results.** Otherwise re-entering the results phase
 *    after a fresh run could flash the previous run's groups.
 */
export function resetFingerprintCachesForNewRun(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: libopsQueryKeys.fingerprintProgress() })
  queryClient.removeQueries({ queryKey: libopsQueryKeys.duplicates() })
}

/**
 * `POST /scan/fingerprints` — start fingerprint computation.
 * On success the page flips to the computing phase and starts its explicit
 * progress poll (see `DuplicateCheckPage`). We also reset the fingerprint caches
 * for the new run — see {@link resetFingerprintCachesForNewRun}.
 */
export function useStartFingerprintMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (params?: { recomputeAll?: boolean; retryFailed?: boolean }) =>
      getFingerprintApi().startFingerprintCompute(params),
    onSuccess: () => resetFingerprintCachesForNewRun(queryClient),
  })
}

/**
 * `POST /scan/fingerprints/cancel` — cancel a running computation.
 * Invalidates the status + progress queries on success so the page picks up
 * the latest counts.
 */
export function useCancelFingerprintMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => getFingerprintApi().cancelFingerprintCompute(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: libopsQueryKeys.fingerprintStatus() })
      void queryClient.invalidateQueries({ queryKey: libopsQueryKeys.fingerprintProgress() })
    },
  })
}

/**
 * `POST /songs/batch-delete` — delete duplicate songs.
 * Invalidates the duplicates query on success so the results refresh.
 */
export function useBatchDeleteMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ ids, deleteFiles }: { ids: number[]; deleteFiles: boolean }) =>
      getFingerprintApi().batchDelete(ids, deleteFiles),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: libopsQueryKeys.duplicates() })
    },
  })
}
