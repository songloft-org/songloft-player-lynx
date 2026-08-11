import { useEffect, useRef } from '@lynx-js/react'
import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query'

import type { ScanProgress, ScanStatus } from '../../../models/library-ops.js'
import { getScanApi, type StartScanParams } from '../api/index.js'
import { shouldInvalidateOnComplete } from '../domain/scan-model.js'
import { libopsQueryKeys } from './scan-query.js'

/**
 * Scan / metadata-refresh actions and the post-scan cache invalidation — batch 19.
 */

/**
 * Drop every cache a finished scan can have invalidated.
 *
 * The Flutter reference only invalidated the playlist list, so freshly imported
 * songs did **not** appear in the library until something else refetched — you
 * scanned, went to Library, and saw the old list. We additionally drop the song
 * and facet caches. Literal key prefixes are used (not the key factories) so
 * every filter/field variant is matched, same technique as
 * `features/playlist/data/playlist-mutations.ts`.
 */
export function invalidateAfterScan(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: ['library', 'songs'] })
  void queryClient.invalidateQueries({ queryKey: ['library', 'facets'] })
  void queryClient.invalidateQueries({ queryKey: ['playlist', 'list'] })
}

/**
 * Fire `invalidateAfterScan` on the rising edge of `completed`.
 *
 * TanStack Query v5 removed `useQuery`'s `onSuccess`, so a completion side
 * effect has to be an effect keyed on the observed status. The edge check lives
 * in a pure function (`shouldInvalidateOnComplete`) so the "don't re-fire while
 * status stays completed" rule is unit-tested rather than implied.
 */
export function useScanCompletionEffect(progress: ScanProgress | undefined): void {
  const queryClient = useQueryClient()
  const previous = useRef<ScanStatus | undefined>(undefined)

  useEffect(() => {
    const next = progress?.status
    if (next && shouldInvalidateOnComplete(previous.current, next)) {
      invalidateAfterScan(queryClient)
    }
    previous.current = next
  }, [progress?.status])
}

export function useStartScanMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (params: StartScanParams) => getScanApi().startScan(params),
    onSuccess: () => {
      // Read the new progress immediately instead of waiting a full interval.
      void queryClient.invalidateQueries({ queryKey: libopsQueryKeys.scanProgress() })
    },
  })
}

export function useCancelScanMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => getScanApi().cancelScan(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: libopsQueryKeys.scanProgress() })
    },
  })
}

export function useStartMetadataRefreshMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => getScanApi().startMetadataRefresh(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: libopsQueryKeys.metadataProgress() })
    },
  })
}

export function useCancelMetadataRefreshMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => getScanApi().cancelMetadataRefresh(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: libopsQueryKeys.metadataProgress() })
    },
  })
}
