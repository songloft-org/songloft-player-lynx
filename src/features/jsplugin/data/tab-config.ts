import { useQuery } from '@tanstack/react-query'

import { getSettingsApi } from '../../settings/api/index.js'
import { getJSPluginApi } from '../api/index.js'
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

/** The shell's live tab configuration — everything it needs to build the nav bar. */
export interface ShellNavTabs {
  showLibrary: boolean
  pluginTabs: PluginTabEntry[]
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
 * The `icon` field is merged from the plugin list cache: backend configs saved
 * before the field was added to the schema carry no icon, and the plugin list
 * does (same back-fill the old `usePluginTabsWithIcons` existed for).
 *
 * Shares the `['settings', 'tab-config']` key prefix with the config page, so
 * its save-triggered invalidation refetches this too and the bar follows a
 * config change without a restart. The plugin mutations (toggle / delete /
 * install) invalidate the same prefix — a tab appears exactly when its plugin
 * is both installed and enabled.
 */
export function useShellNavTabs() {
  return useQuery({
    queryKey: ['settings', 'tab-config', 'shell-nav'],
    queryFn: async (): Promise<ShellNavTabs> => {
      const [config, pluginRes] = await Promise.all([
        getSettingsApi().getTabConfig(),
        getJSPluginApi().getPlugins(),
      ])
      const pluginMap = new Map(pluginRes.plugins.map((p) => [p.entryPath, p]))
      return {
        showLibrary: config.showLibrary,
        pluginTabs: filterActivePluginTabs(config.pluginTabs, pluginRes.plugins).map((tab) => ({
          ...tab,
          // The `icon` field is merged from the plugin list cache: backend
          // configs saved before the field existed carry no icon.
          icon: tab.icon || pluginMap.get(tab.entryPath)?.icon || undefined,
        })),
      }
    },
    staleTime: 60_000,
  })
}
