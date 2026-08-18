import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  DEFAULT_LIBRARY_BROWSE_CONFIG,
  type LibraryBrowseConfig,
} from '../../../models/library-browse.js'
import { getLibraryBrowseApi } from '../api/index.js'

/**
 * TanStack Query wiring for the library browse config.
 *
 * Deliberately **no `placeholderData`**: seeding the default 14 views would
 * let the page pick `all` and start fetching the flat song list, then jump
 * mid-flight to another view if the real config hides `all` — a visible flash
 * plus a wasted request. While `isPending` the page renders a skeleton; on
 * `isError` it falls back to the default config (Flutter parity: offline or a
 * backend without the endpoint still gets a complete library).
 */

/** Under the `['library']` prefix so scan-completion invalidation covers it. */
export const libraryBrowseQueryKey = ['library', 'browse-config'] as const

export function useLibraryBrowseConfigQuery() {
  return useQuery({
    queryKey: libraryBrowseQueryKey,
    queryFn: () => getLibraryBrowseApi().getLibraryBrowse(),
  })
}

/**
 * Optimistic save: the draft is applied to the cache immediately (the editor
 * exits without waiting on the network), the server's normalized response
 * overwrites it on success, and a failure refetches to roll back to the
 * server truth — errors surface via `isError` instead of being swallowed.
 */
export function useUpdateLibraryBrowseMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (config: LibraryBrowseConfig) =>
      getLibraryBrowseApi().updateLibraryBrowse(config),
    onMutate: (config) => {
      queryClient.setQueryData(libraryBrowseQueryKey, config)
    },
    onSuccess: (saved) => {
      queryClient.setQueryData(libraryBrowseQueryKey, saved)
    },
    onError: () => {
      void queryClient.invalidateQueries({ queryKey: libraryBrowseQueryKey })
    },
  })
}

/**
 * The config to render from a query result: fetched data, or the default
 * config on error, or `undefined` while still pending (render a skeleton,
 * never the default — see the module note).
 */
export function libraryBrowseConfigOrFallback(query: {
  data?: LibraryBrowseConfig
  isError: boolean
}): LibraryBrowseConfig | undefined {
  if (query.data) return query.data
  return query.isError ? DEFAULT_LIBRARY_BROWSE_CONFIG : undefined
}
