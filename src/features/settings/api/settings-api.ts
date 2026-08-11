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
      })),
    }
    const res = await this.client.put<unknown>(`${apiPrefix}/settings/tab-config`, body)
    return parseTabConfig(res.data)
  }
}
