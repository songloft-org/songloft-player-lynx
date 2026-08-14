import { apiPrefix } from '../../../core/config/app-config.js'
import type { HttpClient } from '../../../core/network/http-client.js'
import { coerceLogLevel, type LogLevel } from '../domain/log-level.js'
import { parseTabConfig, type TabConfig } from '../../jsplugin/data/tab-config.js'

/**
 * Settings backend API (Diagnostics slice only — batch 15). Mirrors the
 * Flutter `SettingsApi`'s log endpoints:
 * - `GET/PUT /api/v1/settings/log-level` — backend log verbosity.
 * - `GET /api/v1/logs/export` — sanitized backend log text.
 *
 * The Flutter version also zips these together with a native frontend log
 * file and hands the archive to the OS share sheet (`share_plus`). Lynx has no
 * native share module yet (same class of gap as native audio/storage), so this
 * port stops at fetching + displaying the backend log text — see PROGRESS for
 * the deferred zip/share/local-file-logger scope.
 */
export class SettingsApi {
  constructor(private readonly client: HttpClient) {}

  async getLogLevel(): Promise<LogLevel> {
    const res = await this.client.get<{ level?: string }>(`${apiPrefix}/settings/log-level`)
    return coerceLogLevel(res.data?.level)
  }

  async setLogLevel(level: LogLevel): Promise<void> {
    await this.client.put(`${apiPrefix}/settings/log-level`, { level })
  }

  async getVersion(): Promise<string> {
    const res = await this.client.get<Record<string, unknown>>(`${apiPrefix}/version`)
    const data = res.data ?? {}
    return String(data.version ?? data.app_version ?? '')
  }

  /** Raw (already backend-sanitized) log text; empty string if the body is empty. */
  async exportLogs(): Promise<string> {
    const res = await this.client.get<string>(`${apiPrefix}/logs/export`, { parseJson: false })
    return typeof res.data === 'string' ? res.data : ''
  }

  async getTabConfig(): Promise<TabConfig> {
    const res = await this.client.get<unknown>(`${apiPrefix}/settings/tab-config`)
    return parseTabConfig(res.data)
  }

  async updateTabConfig(config: TabConfig): Promise<TabConfig> {
    const body = {
      show_library: config.showLibrary,
      plugin_tabs: config.pluginTabs.map((t) => ({
        plugin_id: t.pluginId,
        entry_path: t.entryPath,
        name: t.name,
        icon: t.icon ?? '',
      })),
    }
    const res = await this.client.put<unknown>(`${apiPrefix}/settings/tab-config`, body)
    return parseTabConfig(res.data)
  }

  // ── User preferences (cloud-synced) ────────────────────────────────────

  async getUserPreferences(): Promise<Record<string, unknown>> {
    const res = await this.client.get<unknown>(`${apiPrefix}/settings/user-preferences`)
    return (res.data ?? {}) as Record<string, unknown>
  }

  async updateUserPreferences(prefs: Record<string, unknown>): Promise<void> {
    await this.client.put(`${apiPrefix}/settings/user-preferences`, prefs)
  }

  // ── Equalizer (cloud-synced) ───────────────────────────────────────────

  async getEqualizer(): Promise<Record<string, unknown>> {
    const res = await this.client.get<unknown>(`${apiPrefix}/settings/equalizer`)
    return (res.data ?? {}) as Record<string, unknown>
  }

  async updateEqualizer(eq: Record<string, unknown>): Promise<void> {
    await this.client.put(`${apiPrefix}/settings/equalizer`, eq)
  }

  // ── Volume normalize (cloud-synced; also read by miot plugin) ──────────

  async getVolumeNormalize(): Promise<boolean> {
    const res = await this.client.get<unknown>(`${apiPrefix}/settings/volume-normalize`)
    const data = (res.data ?? {}) as Record<string, unknown>
    return data.enabled === true
  }

  async updateVolumeNormalize(enabled: boolean): Promise<void> {
    await this.client.put(`${apiPrefix}/settings/volume-normalize`, { enabled })
  }

  // ── Library browse (views configuration) ───────────────────────────────

  async getLibraryBrowse(): Promise<LibraryBrowseConfig> {
    const res = await this.client.get<unknown>(`${apiPrefix}/settings/library-browse`)
    return parseLibraryBrowseConfig(res.data)
  }

  async updateLibraryBrowse(config: LibraryBrowseConfig): Promise<void> {
    await this.client.put(`${apiPrefix}/settings/library-browse`, {
      views: config.views.map((v) => ({
        id: v.id,
        visible: v.visible,
        order: v.order,
      })),
    })
  }
}

/** A single browse view (song source + facet dimension). */
export interface BrowseView {
  id: string
  labelKey: string
  type: 'source' | 'facet'
  visible: boolean
  order: number
}

/** Library browse configuration — 14 views defined by the backend. */
export interface LibraryBrowseConfig {
  views: BrowseView[]
}

const KNOWN_VIEWS: BrowseView[] = [
  { id: 'local', labelKey: 'library.browseLocal', type: 'source', visible: true, order: 0 },
  { id: 'remote', labelKey: 'library.browseRemote', type: 'source', visible: true, order: 1 },
  { id: 'radio', labelKey: 'library.browseRadio', type: 'source', visible: true, order: 2 },
  { id: 'artist', labelKey: 'library.facetArtist', type: 'facet', visible: true, order: 3 },
  { id: 'album', labelKey: 'library.facetAlbum', type: 'facet', visible: true, order: 4 },
  { id: 'genre', labelKey: 'library.facetGenre', type: 'facet', visible: true, order: 5 },
  { id: 'year', labelKey: 'library.browseYear', type: 'facet', visible: true, order: 6 },
  { id: 'decade', labelKey: 'library.browseDecade', type: 'facet', visible: true, order: 7 },
  { id: 'language', labelKey: 'library.browseLanguage', type: 'facet', visible: true, order: 8 },
  { id: 'style', labelKey: 'library.browseStyle', type: 'facet', visible: true, order: 9 },
  { id: 'folder', labelKey: 'library.browseFolder', type: 'source', visible: true, order: 10 },
  { id: 'recent', labelKey: 'library.browseRecent', type: 'source', visible: true, order: 11 },
  { id: 'favorites', labelKey: 'library.browseFavorites', type: 'source', visible: true, order: 12 },
  { id: 'random', labelKey: 'library.browseRandom', type: 'source', visible: true, order: 13 },
]

function parseLibraryBrowseConfig(data: unknown): LibraryBrowseConfig {
  const obj = (data ?? {}) as Record<string, unknown>
  const rawViews = Array.isArray(obj.views) ? obj.views : []
  const serverMap = new Map<string, { visible: boolean; order: number }>()
  for (const v of rawViews) {
    const item = v as Record<string, unknown>
    const id = String(item.id ?? '')
    if (id) serverMap.set(id, { visible: item.visible !== false, order: Number(item.order ?? 0) })
  }
  // Merge server config over known defaults.
  const views = KNOWN_VIEWS.map((kv) => {
    const server = serverMap.get(kv.id)
    return server ? { ...kv, visible: server.visible, order: server.order } : kv
  })
  return { views }
}
