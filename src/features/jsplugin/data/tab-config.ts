import { useEffect, useMemo, useSyncExternalStore } from '@lynx-js/react'
import { useQueries, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query'

import { appConfig } from '../../../core/config/app-config.js'
import { getSongloftStorage } from '../../../core/storage/index.js'
import { safeClearTimeout } from '../../../native/safe-timers.js'
import { useAppSessionStore } from '../../../store/app-session.js'
import { getSettingsApi } from '../../settings/api/index.js'
import { getJSPluginApi } from '../api/index.js'
import { isSvgIcon } from '../domain/plugin-icon.js'
import { isSvgMarkup, loadPluginIcon } from './jsplugin-query.js'
import type { JSPlugin } from '../../../models/jsplugin.js'

export interface PluginTabEntry {
  pluginId: number
  entryPath: string
  name: string
  icon?: string
}

export interface TabConfig {
  showLibrary: boolean
  pluginTabs: PluginTabEntry[]
}

export function parseTabConfig(data: unknown): TabConfig {
  const obj = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>
  const pluginTabs = Array.isArray(obj.plugin_tabs)
    ? obj.plugin_tabs.map((e: Record<string, unknown>) => ({
        pluginId: Number(e?.plugin_id ?? 0),
        entryPath: String(e?.entry_path ?? ''),
        name: String(e?.name ?? ''),
        icon: String(e?.icon ?? '') || undefined,
      }))
    : []
  return {
    showLibrary: obj.show_library !== false,
    pluginTabs,
  }
}

export interface ShellPluginTabEntry extends PluginTabEntry {
  /** SVG markup, or null after a failed load. Undefined while loading. */
  svgMarkup?: string | null
}

/** The shell's live tab configuration with resolved plugin icons. */
export interface ShellNavTabs {
  showLibrary: boolean
  pluginTabs: ShellPluginTabEntry[]
}

function shellNavServer(): string {
  if (appConfig.baseUrl === appConfig.bundleBackendBaseUrl) return 'http://bundle.songloft.invalid'
  return `${appConfig.baseUrl}${appConfig.basePath}`
}

const shellNavUsername = () => useAppSessionStore.getState().username

function combineIconMarkup(results: UseQueryResult<string>[]) {
  return results.map(({ data, isError }) => data ?? (isError ? null : undefined))
}

async function readSavedShellNavTabs(key: string): Promise<ShellNavTabs | null> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const raw = await Promise.race([
      getSongloftStorage().prefs.get(key),
      new Promise<null>(resolve => { timer = setTimeout(() => resolve(null), 3000) }),
    ])
    const saved: ShellNavTabs | null = raw ? JSON.parse(raw) : null
    if (typeof saved?.showLibrary === 'boolean' && Array.isArray(saved.pluginTabs)
      && saved.pluginTabs.every(tab => tab && Number.isFinite(tab.pluginId)
        && typeof tab.entryPath === 'string' && tab.entryPath.length > 0
        && typeof tab.name === 'string' && (tab.icon === undefined || typeof tab.icon === 'string'))) {
      return saved
    }
  } catch { /* A missing or unreadable snapshot falls back to the server. */ }
  finally { safeClearTimeout(timer as unknown as number | undefined) }
  return null
}

/**
 * Keep only the tabs whose plugin is installed and active — the nav bar's rule,
 * mirroring Flutter's `active_destinations.dart` (an entry matches only when
 * the plugin list has that entryPath AND it `isActive`). Without this, a
 * disabled or uninstalled plugin kept its tab (and its icon) on the bar.
 */
export function filterActivePluginTabs(
  pluginTabs: PluginTabEntry[],
  plugins: JSPlugin[],
): PluginTabEntry[] {
  const activePaths = new Set(
    plugins.filter((p) => p.isActive && p.entryPath).map((p) => p.entryPath!),
  )
  return pluginTabs.filter((tab) => activePaths.has(tab.entryPath))
}

/**
 * Tab config for the navigation shell: `showLibrary` plus the plugin tabs, in
 * one query — the shell needs both together to build the bar/rail/More sheet.
 *
 * The plugin list supplies icon filenames when tab config omits them.
 * A separate query per SVG lets the layout update as soon as it is ready.
 *
 * Shares the `['settings', 'tab-config']` key prefix with the config page, so
 * its save-triggered invalidation refetches this too and the bar follows a
 * config change without a restart. The plugin mutations (toggle / delete /
 * install) invalidate the same prefix — a tab appears exactly when its plugin
 * is both installed and enabled.
 */
export function useShellNavTabs() {
  const client = useQueryClient()
  const server = useSyncExternalStore(useAppSessionStore.subscribe, shellNavServer)
  const username = useSyncExternalStore(useAppSessionStore.subscribe, shellNavUsername)
  const queryKey = ['settings', 'tab-config', 'shell-nav', server, username] as const
  const storageKey = username ? `shell_nav_tabs_v1:${JSON.stringify([server, username])}` : null
  const iconKey = (tab: PluginTabEntry) =>
    ['shell-nav-icon', server, username, tab.entryPath, tab.icon] as const

  const guardRequest = (signal: AbortSignal) => {
    const requestBaseUrl = `${appConfig.resolvedBaseUrl}${appConfig.basePath}`
    return () => {
      if (signal.aborted || shellNavServer() !== server || shellNavUsername() !== username
        || `${appConfig.resolvedBaseUrl}${appConfig.basePath}` !== requestBaseUrl) {
        throw new Error('Navigation session changed')
      }
    }
  }

  const restore = useQuery({
    queryKey: ['shell-nav-snapshot', server, username],
    enabled: storageKey !== null,
    staleTime: Infinity,
    queryFn: async ({ signal }) => {
      const saved = storageKey && await readSavedShellNavTabs(storageKey)
      if (saved && !signal.aborted && client.getQueryData(queryKey) === undefined) {
        const pluginTabs = saved.pluginTabs.map(({ svgMarkup, ...tab }) => {
          if (isSvgIcon(tab.icon) && typeof svgMarkup === 'string' && isSvgMarkup(svgMarkup)) {
            client.setQueryData(iconKey(tab), svgMarkup, { updatedAt: 0 })
          }
          return tab
        })
        // Seed icons before publishing the layout so both render in the first frame.
        client.setQueryData(queryKey, { showLibrary: saved.showLibrary, pluginTabs }, { updatedAt: 0 })
      }
      return null
    },
  })
  const isRestoring = storageKey !== null && restore.isPending

  const live = useQuery({
    queryKey,
    enabled: !isRestoring,
    queryFn: async ({ signal }): Promise<TabConfig> => {
      const assertCurrent = guardRequest(signal)
      const [config, pluginRes] = await Promise.all([
        getSettingsApi().getTabConfig({ assertCurrent }),
        getJSPluginApi().getPlugins({ assertCurrent }),
      ])
      assertCurrent()
      const pluginMap = new Map(pluginRes.plugins.map((p) => [p.entryPath, p]))
      return {
        showLibrary: config.showLibrary,
        pluginTabs: filterActivePluginTabs(config.pluginTabs, pluginRes.plugins).map((tab) => ({
          ...tab,
          icon: tab.icon || pluginMap.get(tab.entryPath)?.icon || undefined,
        })),
      }
    },
    staleTime: 60_000,
  })

  const layout = live.data
  const iconMarkup = useQueries({
    queries: layout?.pluginTabs.map(tab => ({
      queryKey: iconKey(tab),
      enabled: !isRestoring && isSvgIcon(tab.icon),
      staleTime: 60_000,
      retry: false,
      queryFn: async ({ signal }): Promise<string> => {
        const assertCurrent = guardRequest(signal)
        const markup = await loadPluginIcon(tab.entryPath, tab.icon!, { assertCurrent, signal })
        assertCurrent()
        if (!markup) throw new Error('Invalid plugin SVG icon')
        return markup
      },
    })) ?? [],
    combine: combineIconMarkup,
  })

  const data = useMemo<ShellNavTabs | undefined>(() => layout && ({
    showLibrary: layout.showLibrary,
    pluginTabs: layout.pluginTabs.map((tab, index) => {
      const svgMarkup = iconMarkup[index]
      return svgMarkup === undefined ? tab : { ...tab, svgMarkup }
    }),
  }), [layout, iconMarkup])

  const snapshot = useMemo(() => data && JSON.stringify(data, (key, value) =>
    key === 'svgMarkup' && value === null ? undefined : value,
  ), [data])
  useEffect(() => {
    if (storageKey && snapshot && !isRestoring) {
      void getSongloftStorage().prefs.set(storageKey, snapshot).catch(() => {})
    }
  }, [storageKey, snapshot, isRestoring])

  return { data, isRestoring }
}
