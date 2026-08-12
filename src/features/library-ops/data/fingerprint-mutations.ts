import { useMutation, useQueryClient } from '@tanstack/react-query'

import { getFingerprintApi } from '../api/index.js'
import { libopsQueryKeys } from './scan-query.js'

/**
 * `POST /scan/fingerprints` — start fingerprint computation.
 * On success the caller should set `forced = true` to ensure the progress
 * query starts polling even if the first response is still `idle`.
 */
export function useStartFingerprintMutation() {
  return useMutation({
    mutationFn: (params?: { recomputeAll?: boolean; retryFailed?: boolean }) =>
      getFingerprintApi().startFingerprintCompute(params),
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
