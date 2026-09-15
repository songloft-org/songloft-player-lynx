import { apiPrefix } from '../../../core/config/app-config.js'
import type { HttpClient } from '../../../core/network/http-client.js'
import { coerceLogLevel, type LogLevel } from '../domain/log-level.js'
import type { ProxySettings } from '../domain/proxy-model.js'
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

  // ── Home plugin grid order (drag-drop) ────────────────────────────────

  /**
   * `GET /settings/plugin-order` — entry_paths in home-grid display order.
   *
   * Empty means "use the plugin list's natural order" (a fresh install).
   * Backend guarantees `order` is an array; the client parses defensively
   * anyway so a hand-edited config row can't crash the grid.
   */
  async getPluginOrder(): Promise<string[]> {
    const res = await this.client.get<unknown>(`${apiPrefix}/settings/plugin-order`)
    const data = (res.data ?? {}) as Record<string, unknown>
    return Array.isArray(data.order) ? data.order.map(String) : []
  }

  /**
   * `PUT /settings/plugin-order` — send the full ordered list. Backend prunes
   * orphans (uninstalled plugins) and returns the cleaned array. Disabled
   * plugins stay in place so their spot is preserved across enable/disable.
   */
  async updatePluginOrder(order: string[]): Promise<string[]> {
    const res = await this.client.put<unknown>(`${apiPrefix}/settings/plugin-order`, { order })
    const data = (res.data ?? {}) as Record<string, unknown>
    return Array.isArray(data.order) ? data.order.map(String) : []
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

  // ── Tag sync to file ────────────────────────────────────────────────────

  async getTagSyncToFile(): Promise<boolean> {
    const res = await this.client.get<unknown>(`${apiPrefix}/settings/tag-sync-to-file`)
    const data = (res.data ?? {}) as Record<string, unknown>
    return data.enabled === true
  }

  async updateTagSyncToFile(enabled: boolean): Promise<void> {
    await this.client.put(`${apiPrefix}/settings/tag-sync-to-file`, { enabled })
  }

  // ── Proxy settings (http / github / hls / private-network allowlist) ─────
  // Four independent backend keys the ProxySettingsPage edits together. Loaded
  // and saved in parallel; each is a small `{proxy}` / `{enabled}` / `{allowlist}`
  // body (see the backend `/settings/<name>` convention).

  async getProxySettings(): Promise<ProxySettings> {
    const [http, github, hls, allow] = await Promise.all([
      this.client.get<{ proxy?: string }>(`${apiPrefix}/settings/http-proxy`),
      this.client.get<{ proxy?: string }>(`${apiPrefix}/settings/github-proxy`),
      this.client.get<{ enabled?: boolean }>(`${apiPrefix}/settings/hls-proxy`),
      this.client.get<{ allowlist?: string[] }>(`${apiPrefix}/settings/proxy-private-allowlist`),
    ])
    const allowlist = allow.data?.allowlist
    return {
      httpProxy: http.data?.proxy ?? '',
      githubProxy: github.data?.proxy ?? '',
      hlsEnabled: hls.data?.enabled ?? false,
      allowlist: Array.isArray(allowlist) ? allowlist : [],
    }
  }

  async updateProxySettings(settings: ProxySettings): Promise<void> {
    await Promise.all([
      this.client.put(`${apiPrefix}/settings/http-proxy`, { proxy: settings.httpProxy }),
      this.client.put(`${apiPrefix}/settings/github-proxy`, { proxy: settings.githubProxy }),
      this.client.put(`${apiPrefix}/settings/hls-proxy`, { enabled: settings.hlsEnabled }),
      this.client.put(`${apiPrefix}/settings/proxy-private-allowlist`, { allowlist: settings.allowlist }),
    ])
  }
}
