import { apiPrefix } from '../../../core/config/app-config.js'
import type { HttpClient } from '../../../core/network/http-client.js'
import {
  parseAutoScanSetting,
  parseEnabledFlag,
  type AutoScanSetting,
} from '../../../models/library-ops.js'
import {
  coerceIntervalSeconds,
  coercePlaylistMode,
  coerceTitleSource,
  type AutoScanInterval,
  type PlaylistMode,
  type TitleSource,
} from '../domain/scan-model.js'

/**
 * The six backend-owned scan preferences — batch 19. All live under
 * `/settings/*` and all are plain GET/PUT pairs, ported from the Flutter
 * `SettingsApi` (`features/settings/data/settings_api.dart`).
 *
 * **The per-endpoint defaults differ and are easy to get backwards**:
 * `scan-auto-create-playlists` defaults to `true`, `scan-title-source` to `tag`,
 * but `remote-title-source` to `filename`. Each getter therefore passes its own
 * fallback into the shared coercion helpers rather than relying on one default.
 *
 * Getters never throw on a malformed payload (the coercers fall back); a failed
 * *request* still rejects, and the data layer degrades that to the default value
 * plus a "could not read config" hint — mirroring the Flutter `AsyncNotifier`s.
 */
export class ScanSettingsApi {
  constructor(private readonly client: HttpClient) {}

  /* ------------------------------------------- auto-create playlists (default true) */

  async getAutoCreatePlaylists(): Promise<boolean> {
    const res = await this.client.get<unknown>(
      `${apiPrefix}/settings/scan-auto-create-playlists`,
    )
    return parseEnabledFlag(res.data, true)
  }

  async setAutoCreatePlaylists(enabled: boolean): Promise<void> {
    await this.client.put<unknown>(
      `${apiPrefix}/settings/scan-auto-create-playlists`,
      { enabled },
    )
  }

  /* ------------------------------------------------- playlist mode (default directory) */

  async getPlaylistMode(): Promise<PlaylistMode> {
    const res = await this.client.get<{ mode?: unknown }>(
      `${apiPrefix}/settings/scan-playlist-mode`,
    )
    return coercePlaylistMode(res.data?.mode)
  }

  async setPlaylistMode(mode: PlaylistMode): Promise<void> {
    await this.client.put<unknown>(`${apiPrefix}/settings/scan-playlist-mode`, { mode })
  }

  /* ------------------------------------------------------ scan title source (default tag) */

  async getTitleSource(): Promise<TitleSource> {
    const res = await this.client.get<{ title_source?: unknown }>(
      `${apiPrefix}/settings/scan-title-source`,
    )
    return coerceTitleSource(res.data?.title_source, 'tag')
  }

  async setTitleSource(titleSource: TitleSource): Promise<void> {
    await this.client.put<unknown>(`${apiPrefix}/settings/scan-title-source`, {
      title_source: titleSource,
    })
  }

  /* --------------------------------------------------------------------- auto scan */

  async getAutoScan(): Promise<AutoScanSetting> {
    const res = await this.client.get<unknown>(`${apiPrefix}/settings/auto-scan`)
    const parsed = parseAutoScanSetting(res.data)
    // Snap the interval onto a selectable option so an off-grid server value
    // (e.g. 900s set through the API) can still round-trip through the picker.
    return { enabled: parsed.enabled, intervalSeconds: coerceIntervalSeconds(parsed.intervalSeconds) }
  }

  async setAutoScan(enabled: boolean, intervalSeconds: AutoScanInterval): Promise<void> {
    await this.client.put<unknown>(`${apiPrefix}/settings/auto-scan`, {
      enabled,
      interval_seconds: intervalSeconds,
    })
  }

  /* ---------------------------------------------- auto fingerprint (default false) */

  async getAutoFingerprint(): Promise<boolean> {
    const res = await this.client.get<unknown>(
      `${apiPrefix}/settings/scan-auto-fingerprint`,
    )
    return parseEnabledFlag(res.data, false)
  }

  async setAutoFingerprint(enabled: boolean): Promise<void> {
    await this.client.put<unknown>(`${apiPrefix}/settings/scan-auto-fingerprint`, {
      enabled,
    })
  }

  /* -------------------------------------------- remote title source (default filename) */

  async getRemoteTitleSource(): Promise<TitleSource> {
    const res = await this.client.get<{ title_source?: unknown }>(
      `${apiPrefix}/settings/remote-title-source`,
    )
    return coerceTitleSource(res.data?.title_source, 'filename')
  }

  async setRemoteTitleSource(titleSource: TitleSource): Promise<void> {
    await this.client.put<unknown>(`${apiPrefix}/settings/remote-title-source`, {
      title_source: titleSource,
    })
  }
}
