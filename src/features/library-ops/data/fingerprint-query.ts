import { useQuery } from '@tanstack/react-query'

import { getFingerprintApi } from '../api/index.js'
import { fingerprintPollInterval } from '../domain/fingerprint-model.js'
import { libopsQueryKeys, type PollOptions } from './scan-query.js'

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
 * Fingerprint progress — polled at 2s while the server is computing.
 *
 * Same polling contract as `useScanProgressQuery`: functional `refetchInterval`
 * that stops on terminal state.
 */
export function useFingerprintProgressQuery({
  forced = false,
  paused = false,
}: PollOptions = {}) {
  return useQuery({
    queryKey: libopsQueryKeys.fingerprintProgress(),
    queryFn: () => getFingerprintApi().getFingerprintProgress(),
    staleTime: 0,
    retry: 0,
    refetchIntervalInBackground: true,
    refetchInterval: (query) =>
      fingerprintPollInterval(query.state.data, forced, paused),
  })
}
