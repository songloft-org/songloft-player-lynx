import { apiPrefix } from '../../../core/config/app-config.js'
import type { HttpClient } from '../../../core/network/http-client.js'
import type { ThemePackData } from '../../../shared/theme/theme-pack-mapping.js'

export type { ThemePackData, ThemePackColors } from '../../../shared/theme/theme-pack-mapping.js'

export interface ThemePackItem {
  id: number
  themeId: string
  name: string
  author: string
  description: string
  version: string
  schemaVersion: number
  createdAt: string
  updatedAt: string
}

/**
 * One entry of the online catalog (`POST /theme-packs/catalog/refresh`). The
 * backend resolves `install_state` against the installed list, so a row knows
 * whether it is a fresh install, a reinstall at the same version, or an update.
 */
export interface ThemeCatalogEntry {
  id: string
  name: string
  version: string
  author: string
  description: string
  url: string
  sha256: string
  installState: 'not_installed' | 'installed' | 'has_update'
}

function parseItem(raw: Record<string, unknown>): ThemePackItem {
  return {
    id: Number(raw.id ?? 0),
    themeId: String(raw.theme_id ?? ''),
    name: String(raw.name ?? ''),
    author: String(raw.author ?? ''),
    description: String(raw.description ?? ''),
    version: String(raw.version ?? ''),
    schemaVersion: Number(raw.schema_version ?? 0),
    createdAt: String(raw.created_at ?? ''),
    updatedAt: String(raw.updated_at ?? ''),
  }
}

function parseCatalogEntry(raw: Record<string, unknown>): ThemeCatalogEntry {
  const installState = raw.install_state
  return {
    id: String(raw.id ?? ''),
    name: String(raw.name ?? ''),
    version: String(raw.version ?? ''),
    author: String(raw.author ?? ''),
    description: String(raw.description ?? ''),
    url: String(raw.url ?? ''),
    sha256: String(raw.sha256 ?? ''),
    installState:
      installState === 'installed' || installState === 'has_update'
        ? installState
        : 'not_installed',
  }
}

/**
 * Catalog fetch/install endpoints. The **active** pack's GET/PUT/DELETE live in
 * `src/shared/theme/theme-pack-model.ts` instead — they are app-global theme
 * state, not settings-page API surface.
 */
export class ThemePacksApi {
  constructor(private readonly client: HttpClient) {}

  async list(): Promise<ThemePackItem[]> {
    const res = await this.client.get<unknown[]>(`${apiPrefix}/theme-packs`)
    const arr = Array.isArray(res.data) ? res.data : []
    return arr.map(r => parseItem(r as Record<string, unknown>))
  }

  async deletePack(themeId: string): Promise<void> {
    await this.client.delete(`${apiPrefix}/theme-packs/${encodeURIComponent(themeId)}`)
  }

  /**
   * Server-side GitHub proxy setting, read fresh each call: the backend fetches
   * raw.githubusercontent.com when refreshing/installing, which is unreachable
   * from CN networks without it (the Flutter client passes the same setting
   * through — see `themePackApiProvider`/`githubProxyProvider`).
   */
  private async githubProxy(): Promise<string> {
    try {
      const res = await this.client.get<{ proxy?: string }>(`${apiPrefix}/settings/github-proxy`)
      return res.data?.proxy ?? ''
    } catch {
      return ''
    }
  }

  /**
   * Fetch the online catalog. The backend answers `{ themes: [...], total }`
   * (Go `RefreshCatalog` handler) — this used to read `.items`, which matched
   * nothing and always rendered "no themes available". Errors propagate so the
   * page can distinguish "fetch failed, retry" from a genuinely empty catalog.
   */
  async refreshCatalog(force = false): Promise<ThemeCatalogEntry[]> {
    const githubProxy = await this.githubProxy()
    const res = await this.client.post<Record<string, unknown>>(
      `${apiPrefix}/theme-packs/catalog/refresh`,
      { ...(githubProxy ? { github_proxy: githubProxy } : {}), force },
    )
    const themes = Array.isArray(res.data?.themes) ? res.data!.themes : []
    return themes.map((r: unknown) => parseCatalogEntry(r as Record<string, unknown>))
  }

  /**
   * Install a catalog entry by its URL. The backend downloads and SHA-256
   * verifies the pack itself — the old `{ theme_id }` body was rejected with
   * 400 "missing theme pack URL" every time.
   */
  async installFromCatalog(entry: ThemeCatalogEntry): Promise<void> {
    const githubProxy = await this.githubProxy()
    await this.client.post(`${apiPrefix}/theme-packs/catalog/install`, {
      url: entry.url,
      ...(entry.sha256 ? { sha256: entry.sha256 } : {}),
      ...(githubProxy ? { github_proxy: githubProxy } : {}),
    })
  }
}
