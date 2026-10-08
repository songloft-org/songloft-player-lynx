import type { RegistryPluginEntry } from '../../../models/jsplugin.js'
import type { PluginRegistryConfig } from '../api/index.js'
import { downloadRepository, releaseDownload, type GithubPlugin } from '../domain/github-plugin-validation.js'
import { compareStableVersions } from '../../../core/updater/update-contract.js'

export interface RegistryReturnState {
  registries: PluginRegistryConfig[]
  selectedUrl: string | null
  search: string
  page: number
  plugins: RegistryPluginEntry[]
  total: number
  warnings: string[]
  ready: boolean
}

/** Session-only drill-in snapshots, scoped to the connected server. */
const snapshots = new Map<string, RegistryReturnState>()

export function saveRegistryReturnState(server: string, state: RegistryReturnState): void {
  snapshots.set(server, state)
}

export function takeRegistryReturnState(server: string): RegistryReturnState | undefined {
  const state = snapshots.get(server)
  snapshots.delete(server)
  return state
}

/** An installation in discovery must also update the store hidden behind it. */
export function updateRegistryReturnState(server: string, plugin: GithubPlugin): void {
  const state = snapshots.get(server)
  if (!state) return
  state.plugins = state.plugins.map(entry => {
    if (entry.entryPath !== plugin.manifest.entryPath) return entry
    const sameRepository = releaseDownload(entry.downloadUrl, downloadRepository(plugin)) != null
    return { ...entry, installed: sameRepository, installedVersion: sameRepository ? plugin.manifest.version : undefined,
      hasUpdate: sameRepository && (compareStableVersions(entry.version, plugin.manifest.version) ?? 0) > 0,
      conflict: !sameRepository, conflictWith: sameRepository ? undefined : `${plugin.manifest.name} v${plugin.manifest.version}` }
  })
}
