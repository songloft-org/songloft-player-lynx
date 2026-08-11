import { useQuery } from '@tanstack/react-query'

import { getSettingsApi } from '../../settings/api/index.js'
import { getJSPluginApi } from '../api/index.js'

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

export function usePluginTabs() {
  return useQuery({
    queryKey: ['settings', 'tab-config'],
    queryFn: async () => {
      const config = await getSettingsApi().getTabConfig()
      return config.pluginTabs
    },
    staleTime: 60_000,
  })
}

/**
 * Like `usePluginTabs`, but also merges the `icon` field from the plugin list
 * cache. This ensures icons are populated even when the backend tab config was
 * saved before the `icon` field was added to the schema.
 */
export function usePluginTabsWithIcons() {
  return useQuery({
    queryKey: ['settings', 'tab-config', 'with-icons'],
    queryFn: async () => {
      const [config, pluginRes] = await Promise.all([
        getSettingsApi().getTabConfig(),
        getJSPluginApi().getPlugins(),
      ])
      const pluginMap = new Map(
        pluginRes.plugins.map((p) => [p.entryPath, p]),
      )
      return config.pluginTabs.map((tab) => {
        const plugin = pluginMap.get(tab.entryPath)
        return {
          ...tab,
          icon: tab.icon || plugin?.icon || undefined,
        }
      })
    },
    staleTime: 60_000,
  })
}
