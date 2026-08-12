import { useQuery } from '@tanstack/react-query'

import { getCacheApi } from '../api/index.js'

/**
 * TanStack Query hooks for cache management read operations.
 */

export const cacheQueryKeys = {
  stats: () => ['cache', 'stats'] as const,
  config: () => ['cache', 'config'] as const,
}

/** Fetch cache usage statistics (file count, total size, max size). */
export function useCacheStatsQuery() {
  return useQuery({
    queryKey: cacheQueryKeys.stats(),
    queryFn: () => getCacheApi().getStats(),
  })
}

/** Fetch current cache configuration (dir, max size, transcode settings). */
export function useCacheConfigQuery() {
  return useQuery({
    queryKey: cacheQueryKeys.config(),
    queryFn: () => getCacheApi().getConfig(),
  })
}
