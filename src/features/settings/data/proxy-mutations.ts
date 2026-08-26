import { useMutation, useQueryClient } from '@tanstack/react-query'

import { getSettingsApi } from '../api/index.js'
import type { ProxySettings } from '../domain/proxy-model.js'
import { proxyQueryKeys } from './proxy-query.js'

/**
 * TanStack Query mutation for saving the four proxy settings together.
 */
export function useSaveProxySettingsMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (settings: ProxySettings) => getSettingsApi().updateProxySettings(settings),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: proxyQueryKeys.all() })
    },
  })
}
