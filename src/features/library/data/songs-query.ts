import { useInfiniteQuery } from '@tanstack/react-query'

import { defaultPageSize } from '../../../core/config/constants.js'
import { getSongsApi, type SongsFilters } from '../api/index.js'
import {
  facetsNextPageParam,
  songsNextPageParam,
} from './pagination.js'

/**
 * TanStack Query integration for the library feature — this is roadmap R11's
 * `useInfiniteQuery` landing in a real feature (batch 4 also mounts the
 * `QueryClientProvider` for the first time; see `src/App.tsx`).
 *
 * Both flows page by `offset`/`limit`: `initialPageParam` is `0`, `queryFn`
 * fetches the page at that offset, and `getNextPageParam` (the pure helpers in
 * `./pagination`) advances to the accumulated count while it is below `total`,
 * returning `undefined` at the end so `hasNextPage` flips false. The `queryKey`
 * embeds the active filters so changing a filter starts a fresh cache entry.
 */

/** Stable query-key factory (filters/field participate in cache identity). */
export const libraryQueryKeys = {
  songs: (filters: SongsFilters) => ['library', 'songs', filters] as const,
  facets: (field: string, keyword: string) =>
    ['library', 'facets', field, keyword] as const,
  /**
   * Library totals. Deliberately under the same `['library']` prefix as the lists:
   * the scan-completion effect (batch 19) invalidates that prefix, so finishing an
   * import refreshes the home stats along with the song list.
   */
  stats: () => ['library', 'stats'] as const,
}

/** Infinite songs list for the given filters (flat "songs" view). */
export function useSongsInfiniteQuery(filters: SongsFilters) {
  return useInfiniteQuery({
    queryKey: libraryQueryKeys.songs(filters),
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      getSongsApi().getSongs(filters, { limit: defaultPageSize, offset: pageParam }),
    getNextPageParam: songsNextPageParam,
  })
}

/** Infinite facet grid for a single dimension (`genre` / `artist` / `album`…). */
export function useFacetsInfiniteQuery(field: string, keyword = '') {
  return useInfiniteQuery({
    queryKey: libraryQueryKeys.facets(field, keyword),
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      getSongsApi().getFacets(field, {
        keyword: keyword || undefined,
        limit: defaultPageSize,
        offset: pageParam,
      }),
    getNextPageParam: facetsNextPageParam,
  })
}
