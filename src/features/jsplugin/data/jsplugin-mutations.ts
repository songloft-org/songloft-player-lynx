import { useMutation, useQueryClient } from '@tanstack/react-query'

import { getJSPluginApi, type InstallFromRegistryParams } from '../api/index.js'
import { pluginQueryKeys } from './jsplugin-query.js'

export function useTogglePluginMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, enable }: { id: number; enable: boolean }) =>
      enable ? getJSPluginApi().enablePlugin(id) : getJSPluginApi().disablePlugin(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: pluginQueryKeys.list() })
    },
  })
}

export function useDeletePluginMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => getJSPluginApi().deletePlugin(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: pluginQueryKeys.list() })
    },
  })
}

export function useUpdateAllPluginsMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => getJSPluginApi().updateAllPlugins(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: pluginQueryKeys.list() })
    },
  })
}

export function useInstallFromRegistryMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (params: InstallFromRegistryParams) =>
      getJSPluginApi().installFromRegistry(params),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: pluginQueryKeys.list() })
    },
  })
}
