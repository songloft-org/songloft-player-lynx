import { useQuery } from '@tanstack/react-query'

import { getFingerprintApi } from '../api/index.js'
import { libopsQueryKeys } from './scan-query.js'

/**
 * `GET /songs/duplicates` — fetch all duplicate groups.
 *
 * `enabled` controls whether the query fires; the page only requests duplicates
 * after fingerprint computation finishes (either naturally or on entering the
 * results phase).
 */
export function useDuplicatesQuery(enabled: boolean) {
  return useQuery({
    queryKey: libopsQueryKeys.duplicates(),
    queryFn: () => getFingerprintApi().getDuplicates(),
    staleTime: 0,
    retry: 0,
    enabled,
  })
}
