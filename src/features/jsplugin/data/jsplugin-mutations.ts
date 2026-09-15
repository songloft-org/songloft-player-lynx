import { useMutation, useQueryClient } from '@tanstack/react-query'

import { getJSPluginApi, type GithubProxyParams, type InstallFromRegistryParams } from '../api/index.js'
import { pluginQueryKeys } from './jsplugin-query.js'

/*
 * Toggling, deleting, or installing a plugin can change which plugin tabs the
 * nav bar may show (a tab renders only while its plugin is installed AND
 * enabled — see `filterActivePluginTabs`), so every one of these mutations
 * invalidates the shell-nav query alongside the plugin list. Without it the
 * bar kept a disabled plugin's tab and icon until its 60s staleTime lapsed
 * or a restart.
 */
const tabConfigKeys = ['settings', 'tab-config'] as const
/*
 * Same story as tab-config for the home plugin grid: install/uninstall changes
 * which entry_paths are valid, so the cached order must refetch — the backend
 *'s `handleDelete` prunes the entry, and a fresh GET picks up the change.
 */
const pluginOrderKeys = ['settings', 'plugin-order'] as const

export function useTogglePluginMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, enable }: { id: number; enable: boolean }) =>
      enable ? getJSPluginApi().enablePlugin(id) : getJSPluginApi().disablePlugin(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: pluginQueryKeys.list() })
      void queryClient.invalidateQueries({ queryKey: tabConfigKeys })
    },
  })
}

export function useDeletePluginMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, keepData }: { id: number; keepData?: boolean }) =>
      getJSPluginApi().deletePlugin(id, keepData === true),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: pluginQueryKeys.list() })
      void queryClient.invalidateQueries({ queryKey: tabConfigKeys })
      void queryClient.invalidateQueries({ queryKey: pluginOrderKeys })
    },
  })
}

export function useUpdateAllPluginsMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (params: GithubProxyParams & { force?: boolean } = {}) =>
      getJSPluginApi().updateAllPlugins(params),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: pluginQueryKeys.list() })
    },
  })
}

export function useUpdatePluginMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...params }: { id: number } & GithubProxyParams & { force?: boolean }) =>
      getJSPluginApi().updatePlugin(id, params),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: pluginQueryKeys.list() })
    },
  })
}

export function useSetPluginKeepAliveMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (plugins: string[]) => getJSPluginApi().setPluginKeepAlive(plugins),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: pluginQueryKeys.keepAlive() })
    },
  })
}

export function useSetPluginAutoUpdateMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (enabled: boolean) => getJSPluginApi().setPluginAutoUpdate(enabled),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: pluginQueryKeys.autoUpdate() })
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
      // Installing (or replacing) a plugin can bring a configured tab back.
      void queryClient.invalidateQueries({ queryKey: tabConfigKeys })
    },
  })
}
