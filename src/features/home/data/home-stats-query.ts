import { useQuery } from '@tanstack/react-query'

import { getSongsApi } from '../../library/api/index.js'
import { libraryQueryKeys } from '../../library/data/songs-query.js'

/**
 * Library totals for the home stats panel.
 *
 * The panel used to be assembled from the two playlist sections' `total` fields,
 * which meant it only ever showed playlist/radio counts — not the library summary
 * it looked like. This reads the real endpoint instead.
 *
 * A named hook in the home feature (rather than a call inside the page) is what
 * makes the home render tests mockable: `home-page.test.tsx` mocks this module the
 * same way it mocks `home-query.js`, so no test reaches a live transport.
 */
export function useLibraryStatsQuery() {
  return useQuery({
    queryKey: libraryQueryKeys.stats(),
    queryFn: () => getSongsApi().getLibraryStats(),
  })
}
