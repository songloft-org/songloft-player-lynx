import { apiPrefix } from '../../../core/config/app-config.js'
import type { HttpClient } from '../../../core/network/http-client.js'
import {
  parseLibraryBrowseConfig,
  type LibraryBrowseConfig,
} from '../../../models/library-browse.js'

/**
 * `GET/PUT /api/v1/settings/library-browse` — which library views are visible
 * and in which order (backend `internal/handlers/library_browse_setting.go`).
 *
 * Lives in the library feature, not settings: the library page is the sole
 * consumer, and the old settings-side port spoke a wrong wire dialect
 * (`{id, visible, order}` instead of `{key, visible}` with array-position
 * order), so every PUT was a 400 swallowed by `.catch(() => {})` and every
 * GET silently fell back to defaults — the whole feature was dead.
 */
export class LibraryBrowseApi {
  constructor(private readonly client: HttpClient) {}

  /** Always resolves to a complete 14-entry config (parser fills gaps). */
  async getLibraryBrowse(): Promise<LibraryBrowseConfig> {
    const res = await this.client.get<unknown>(`${apiPrefix}/settings/library-browse`)
    return parseLibraryBrowseConfig(res.data)
  }

  /**
   * Save the config. The backend validates keys (400 on unknown/duplicate) and
   * echoes the normalized full 14-entry list, which the caller should use as
   * the new cache value.
   */
  async updateLibraryBrowse(config: LibraryBrowseConfig): Promise<LibraryBrowseConfig> {
    const res = await this.client.put<unknown>(`${apiPrefix}/settings/library-browse`, {
      views: config.views.map((v) => ({ key: v.key, visible: v.visible })),
    })
    return parseLibraryBrowseConfig(res.data)
  }
}
