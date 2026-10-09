import { useSyncExternalStore } from '@lynx-js/react'
import {
  useIsMutating,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query'

import { appConfig } from '../../../core/config/app-config.js'
import { useAppSessionStore } from '../../../store/app-session.js'
import { getSettingsApi } from '../../settings/api/index.js'
import { getJSPluginApi } from '../api/index.js'
import { filterActivePluginTabs, type TabConfig } from './tab-config.js'
import type { JSPlugin } from '../../../models/jsplugin.js'

export const MAX_NAVIGATION_TABS = 12

export function navigationTabCount(config: TabConfig, plugins: JSPlugin[]): number {
  return 2 + Number(config.showLibrary) + filterActivePluginTabs(config.pluginTabs, plugins).length
}

/** Replace only active slots so disabling a plugin does not erase its preferred position. */
export function reorderActivePluginTabs(
  config: TabConfig,
  plugins: JSPlugin[],
  paths: string[],
): TabConfig {
  const active = filterActivePluginTabs(config.pluginTabs, plugins)
  const byPath = new Map(active.map((tab) => [tab.entryPath, tab]))
  const ordered = [...new Set(paths)].flatMap((path) =>
    byPath.has(path) ? [byPath.get(path)!] : [],
  )
  ordered.push(...active.filter((tab) => !paths.includes(tab.entryPath)))
  let index = 0
  return {
    ...config,
    pluginTabs: config.pluginTabs.map((tab) =>
      byPath.has(tab.entryPath) ? ordered[index++]! : tab,
    ),
  }
}

function currentScope(): string {
  return JSON.stringify([
    appConfig.resolvedBaseUrl,
    appConfig.basePath,
    useAppSessionStore.getState().username,
  ])
}

interface NavigationData {
  config: TabConfig
  plugins: JSPlugin[]
}

// Query identity also changes after cache.clear(), including switching back to the same server.
const saveLocks = new WeakMap<QueryClient, Set<object>>()

export function useNavigationSettings() {
  const scope = useSyncExternalStore(useAppSessionStore.subscribe, currentScope, currentScope)
  const serverBaseUrl = `${appConfig.resolvedBaseUrl}${appConfig.basePath}`
  const queryKey = ['settings', 'tab-config', 'editor', scope] as const
  const mutationKey = ['settings', 'tab-config', 'save', scope] as const
  const client = useQueryClient()
  const query = useQuery({
    queryKey,
    retry: false,
    staleTime: 60_000,
    queryFn: async (): Promise<NavigationData> => {
      const [config, result] = await Promise.all([
        getSettingsApi().getTabConfig(),
        getJSPluginApi().getPlugins(),
      ])
      if (scope !== currentScope()) throw new Error('Server changed')
      return { config, plugins: result.plugins }
    },
  })
  const readOwner = client.getQueryCache().find({ queryKey, exact: true })
  const saving =
    useIsMutating({
      mutationKey,
      predicate: (mutation) =>
        (mutation.state.variables as { owner?: object } | undefined)?.owner === readOwner,
    }) > 0
  const mutation = useMutation({
    mutationKey,
    mutationFn: async ({ next, owner }: { next: TabConfig; owner: object }) => {
      const assertCurrent = () => {
        if (
          scope !== currentScope() ||
          client.getQueryCache().find({ queryKey, exact: true }) !== owner
        ) {
          throw new Error('Server changed')
        }
      }
      assertCurrent()
      const saved = await getSettingsApi().updateTabConfig(next, { serverBaseUrl, assertCurrent })
      // A focus/plugin refresh may have started after this write acquired its lock.
      // Discard its older snapshot, then refresh eligibility after applying the saved response.
      const currentOwner = client.getQueryCache().find({ queryKey, exact: true })
      const refreshInFlight =
        scope === currentScope() &&
        currentOwner === owner &&
        currentOwner?.state.fetchStatus !== 'idle'
      if (refreshInFlight) await client.cancelQueries({ queryKey, exact: true })
      if (
        scope === currentScope() &&
        client.getQueryCache().find({ queryKey, exact: true }) === owner
      ) {
        client.setQueryData<NavigationData>(queryKey, (previous) =>
          previous ? { ...previous, config: saved } : previous,
        )
        if (refreshInFlight) await client.invalidateQueries({ queryKey, exact: true })
        await client.invalidateQueries({ queryKey: ['settings', 'tab-config', 'shell-nav'] })
      }
    },
  })

  const save = async (next: TabConfig) => {
    const owner = client.getQueryCache().find({ queryKey, exact: true })
    let locks = saveLocks.get(client)
    if (!locks) {
      locks = new Set()
      saveLocks.set(client, locks)
    }
    // Check cache state before React renders a refetch error or pending save.
    if (
      !owner ||
      owner !== readOwner ||
      owner.state.status !== 'success' ||
      owner.state.fetchStatus !== 'idle' ||
      scope !== currentScope() ||
      locks.has(owner)
    )
      return
    locks.add(owner)
    try {
      await mutation.mutateAsync({ next, owner })
    } finally {
      locks.delete(owner)
    }
  }

  return {
    config: query.data?.config,
    plugins: query.data?.plugins ?? [],
    ready: query.isSuccess && !query.isFetching && !saving && scope === currentScope(),
    loading: query.isPending,
    error: query.isError,
    fetching: query.isFetching,
    saving,
    retry: () => {
      void query.refetch()
    },
    save,
  }
}

export type NavigationSettings = ReturnType<typeof useNavigationSettings>
