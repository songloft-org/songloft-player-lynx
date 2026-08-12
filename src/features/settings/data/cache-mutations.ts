import { useMutation, useQueryClient } from '@tanstack/react-query'

import { getCacheApi } from '../api/index.js'
import type { CacheConfigUpdate, DirValidateRequest } from '../domain/cache-model.js'
import { cacheQueryKeys } from './cache-query.js'

/**
 * TanStack Query mutation hooks for cache management write operations.
 */

/** Update cache configuration (dir, max size, transcode format/quality). */
export function useUpdateCacheConfigMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: CacheConfigUpdate) => getCacheApi().updateConfig(body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: cacheQueryKeys.config() })
      void queryClient.invalidateQueries({ queryKey: cacheQueryKeys.stats() })
    },
  })
}

/** Clear all cached files. */
export function useCleanCacheMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => getCacheApi().cleanCache(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: cacheQueryKeys.stats() })
    },
  })
}

/** Validate a directory path (check writability, free space). */
export function useValidateCacheDirMutation() {
  return useMutation({
    mutationFn: (body: DirValidateRequest) => getCacheApi().validateDir(body),
  })
}
