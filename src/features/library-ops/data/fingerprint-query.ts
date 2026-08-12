import { useQuery } from '@tanstack/react-query'

import { getFingerprintApi } from '../api/index.js'
import { libopsQueryKeys } from './scan-query.js'

/**
 * Fingerprint status — fetched once on page mount (no polling). Refetched
 * manually after cancel or recheck.
 */
export function useFingerprintStatusQuery() {
  return useQuery({
    queryKey: libopsQueryKeys.fingerprintStatus(),
    queryFn: () => getFingerprintApi().getFingerprintStatus(),
    staleTime: 0,
    retry: 0,
  })
}

/**
 * Fingerprint progress query — **no built-in polling**.
 *
 * Batch 29b: query-core's functional `refetchInterval` proved unreliable on the
 * Lynx 4.0 build for this query — verified on device that the interval callback
 * stopped firing after the first fetch even while `refetchInterval` kept
 * returning `2000` (the `computed/total` count froze at its first value while
 * the backend kept advancing). Rather than depend on query-core re-arming its
 * internal timer, the page drives the poll with an explicit `setInterval` (Lynx
 * BTS `setInterval` was verified to fire reliably) calling `refetch()` on this
 * query. So this hook only owns the fetch + cache; the cadence lives in the
 * page (`useFingerprintProgressPoll` in `fingerprint-mutations`-adjacent code).
 *
 * `enabled` is still honoured so the query does not fetch outside the computing
 * phase.
 */
export function useFingerprintProgressQuery({ enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: libopsQueryKeys.fingerprintProgress(),
    queryFn: () => getFingerprintApi().getFingerprintProgress(),
    enabled,
    staleTime: 0,
    retry: 0,
  })
}
