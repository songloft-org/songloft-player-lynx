import { useQuery } from '@tanstack/react-query'

import { getSettingsApi } from '../../settings/api/index.js'

export interface PluginTabEntry {
  pluginId: number
  entryPath: string
  name: string
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
