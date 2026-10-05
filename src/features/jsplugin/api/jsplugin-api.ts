import { apiPrefix, appConfig } from '../../../core/config/app-config.js'
import { getCachedAccessToken } from '../../../core/network/token-cache.js'
import type { HttpClient } from '../../../core/network/http-client.js'

import {
  parseJSPlugin,
  parseJSPluginListResponse,
  parseRegistryRefreshResponse,
  parseJSPluginBatchUpdateResponse,
  parseJSPluginUpdateCheck,
  parseJSPluginUploadResponse,
  type JSPlugin,
  type JSPluginListResponse,
  type JSPluginBatchUpdateResponse,
  type JSPluginUpdateCheck,
  type JSPluginUploadResponse,
  type RegistryRefreshResponse,
} from '../../../models/jsplugin.js'

const INSTALL_TIMEOUT_MS = 4 * 60_000
const BATCH_UPDATE_TIMEOUT_MS = 30 * 60_000

/** A plugin registry source as stored in Settings → Plugin registries. */
export interface PluginRegistryConfig {
  url: string
  name?: string
  token?: string
  enabled?: boolean
}

export interface RegistryRefreshParams extends GithubProxyParams {
  registryUrl?: string
  allSources?: boolean
  page?: number
  pageSize?: number
  search?: string
  /** Only for a private single source; the "all" mode resolves tokens server-side. */
  token?: string
  force?: boolean
}

export interface InstallFromRegistryParams extends GithubProxyParams {
  downloadUrl: string
  sourceUrl?: string
  overwrite?: boolean
  token?: string
}

/**
 * The GitHub proxy prefix configured in Settings → Network Proxy. The update
 * endpoints accept it so downloads can bypass regions where raw.githubusercontent
 * is unreachable; empty string means "no proxy".
 */
export interface GithubProxyParams {
  githubProxy?: string
}

export class JSPluginApi {
  constructor(private readonly client: HttpClient) {}

  async getPlugins(): Promise<JSPluginListResponse> {
    const res = await this.client.get<unknown>(`${apiPrefix}/jsplugins`)
    return parseJSPluginListResponse(res.data)
  }

  /**
   * `GET /jsplugin/{entryPath}/static/{path}` as **text**, for SVG icon markup.
   *
   * `parseJson: false` (same as `SettingsApi.exportLogs`) keeps the body raw. The
   * markup is fetched here rather than handed to `<svg src>` because the native SVG
   * element cannot fetch a URL unless the Android host registers a
   * `GenericResourceFetcher`, which this host does not — on device it logs
   * `getGenericResourceFetcher is null, svg fetch src failed!` and renders nothing.
   * `<svg content>` needs no host support and is the path the built-in icons use.
   *
   * Despite swagger declaring this endpoint auth-free, it answers 401 without a
   * token — so it goes through the authenticated client.
   */
  async getStaticText(entryPath: string, path: string): Promise<string> {
    const res = await this.client.get<string>(
      `${apiPrefix}/jsplugin/${entryPath}/static/${path}`,
      { parseJson: false },
    )
    return typeof res.data === 'string' ? res.data : ''
  }

  async getPlugin(id: number): Promise<JSPlugin> {
    const res = await this.client.get<unknown>(`${apiPrefix}/jsplugins/${id}`)
    const data = res.data as Record<string, unknown> | undefined
    return parseJSPlugin(data?.plugin)
  }

  async enablePlugin(id: number): Promise<JSPlugin> {
    const res = await this.client.post<unknown>(`${apiPrefix}/jsplugins/${id}/enable`)
    const data = res.data as Record<string, unknown> | undefined
    return parseJSPlugin(data?.plugin)
  }

  async disablePlugin(id: number): Promise<JSPlugin> {
    const res = await this.client.post<unknown>(`${apiPrefix}/jsplugins/${id}/disable`)
    const data = res.data as Record<string, unknown> | undefined
    return parseJSPlugin(data?.plugin)
  }

  async deletePlugin(id: number, keepData = false): Promise<void> {
    const query: Record<string, string> = {}
    if (keepData) query.keep_data = 'true'
    await this.client.delete(`${apiPrefix}/jsplugins/${id}`, { query })
  }

  async checkUpdate(id: number, params: GithubProxyParams = {}): Promise<JSPluginUpdateCheck> {
    const query: Record<string, string> = {}
    if (params.githubProxy) query.github_proxy = params.githubProxy
    const res = await this.client.get<unknown>(`${apiPrefix}/jsplugins/${id}/check-update`, {
      query, receiveTimeoutMs: 45_000,
    })
    return parseJSPluginUpdateCheck(res.data)
  }

  async updatePlugin(
    id: number,
    params: GithubProxyParams & { force?: boolean } = {},
  ): Promise<void> {
    const body: Record<string, unknown> = {}
    if (params.githubProxy) body.github_proxy = params.githubProxy
    if (params.force) body.force = true
    await this.client.post(`${apiPrefix}/jsplugins/${id}/update`, body, {
      receiveTimeoutMs: INSTALL_TIMEOUT_MS,
    })
  }

  async updateAllPlugins(
    params: GithubProxyParams & { force?: boolean } = {},
  ): Promise<JSPluginBatchUpdateResponse> {
    const body: Record<string, unknown> = {}
    if (params.githubProxy) body.github_proxy = params.githubProxy
    if (params.force) body.force = true
    const res = await this.client.post<unknown>(`${apiPrefix}/jsplugins/update-all`, body, {
      receiveTimeoutMs: BATCH_UPDATE_TIMEOUT_MS,
    })
    return parseJSPluginBatchUpdateResponse(res.data)
  }

  /** `POST /jsplugins/storage/cleanup` — drop persisted data no installed plugin owns. */
  async cleanupOrphanStorage(): Promise<string> {
    const res = await this.client.post<unknown>(`${apiPrefix}/jsplugins/storage/cleanup`)
    const data = (res.data ?? {}) as Record<string, unknown>
    return typeof data.message === 'string' ? data.message : ''
  }

  // ── Plugin manager settings (auto-update / keep-alive) ────────────────────

  async getPluginAutoUpdate(): Promise<boolean> {
    const res = await this.client.get<unknown>(`${apiPrefix}/settings/plugin-auto-update`)
    const data = (res.data ?? {}) as Record<string, unknown>
    return data.enabled === true
  }

  async setPluginAutoUpdate(enabled: boolean): Promise<void> {
    await this.client.put(`${apiPrefix}/settings/plugin-auto-update`, { enabled })
  }

  async getPluginKeepAlive(): Promise<string[]> {
    const res = await this.client.get<unknown>(`${apiPrefix}/settings/plugin-keep-alive`)
    const data = (res.data ?? {}) as Record<string, unknown>
    return Array.isArray(data.plugins) ? data.plugins.map(String) : []
  }

  async setPluginKeepAlive(plugins: string[]): Promise<void> {
    await this.client.put(`${apiPrefix}/settings/plugin-keep-alive`, { plugins })
  }

  /** `GET /settings/github-proxy` — the same value ProxySettingsPage edits. */
  async getGithubProxy(): Promise<string> {
    const res = await this.client.get<unknown>(`${apiPrefix}/settings/github-proxy`)
    const data = (res.data ?? {}) as Record<string, unknown>
    return typeof data.proxy === 'string' ? data.proxy : ''
  }

  async refreshRegistry(params: RegistryRefreshParams = {}): Promise<RegistryRefreshResponse> {
    const body: Record<string, unknown> = {
      page: params.page ?? 1,
      page_size: params.pageSize ?? 20,
    }
    if (params.allSources) body.all_sources = true
    else if (params.registryUrl) {
      body.registry_url = params.registryUrl
      // "All" mode ignores the token — each source uses the one stored with it.
      if (params.token) body.token = params.token
    }
    if (params.search) body.search = params.search
    if (params.force) body.force = true
    if (params.githubProxy) body.github_proxy = params.githubProxy
    const res = await this.client.post<unknown>(`${apiPrefix}/jsplugins/registry/refresh`, body, {
      receiveTimeoutMs: 60_000,
    })
    return parseRegistryRefreshResponse(res.data)
  }

  /**
   * `POST /jsplugins/registry/install` — download and install (or update, or
   * reinstall) one store entry. Answers with the same per-file result shape as
   * upload; the store toasts `message` and updates its rows in place from it.
   */
  async installFromRegistry(params: InstallFromRegistryParams): Promise<JSPluginUploadResponse> {
    const body: Record<string, unknown> = { download_url: params.downloadUrl }
    if (params.sourceUrl) body.source_url = params.sourceUrl
    if (params.overwrite) body.overwrite = true
    if (params.githubProxy) body.github_proxy = params.githubProxy
    if (params.token) body.token = params.token
    const res = await this.client.post<unknown>(`${apiPrefix}/jsplugins/registry/install`, body, {
      receiveTimeoutMs: INSTALL_TIMEOUT_MS,
    })
    return parseJSPluginUploadResponse(res.data)
  }

  /**
   * GET an arbitrary (possibly external) icon URL as **text**, for `<svg content>`.
   *
   * Store entries carry their own icon URLs — GitHub raw links in the common case,
   * which the native SVG element cannot fetch (no `GenericResourceFetcher` on this
   * host). Same trick as `getStaticText`, but for URLs that are not under our API
   * prefix.
   */
  async getRemoteText(url: string): Promise<string> {
    const res = await this.client.get<string>(url, { parseJson: false })
    return typeof res.data === 'string' ? res.data : ''
  }

  /** `POST /jsplugins/upload` — upload a plugin ZIP file (multipart). */
  /**
   * Absolute upload URL, with the token in the query string.
   *
   * Both parts are load-bearing, and neither was there: this returned the bare
   * path `/api/v1/jsplugins/upload`, which the *native* uploader cannot resolve at
   * all (it is a raw multipart POST through OkHttp / URLSession, not our
   * `HttpClient`) and which the Web host resolved against the page origin — right
   * only in embedded mode. And since that POST bypasses `HttpClient`, no
   * interceptor attaches the bearer token, so the endpoint (`@Security
   * BearerAuth`) answered 401 every time. `access_token` is the documented query
   * fallback the auth middleware accepts, and the same trick `openLogs` uses.
   */
  getUploadUrl(): string {
    const token = getCachedAccessToken()
    const base = `${appConfig.resolvedBaseUrl}${apiPrefix}/jsplugins/upload`
    return token ? `${base}?access_token=${encodeURIComponent(token)}` : base
  }

  // ── Plugin registries (source management) ──────────────────────────────

  async getPluginRegistries(): Promise<PluginRegistryConfig[]> {
    const res = await this.client.get<unknown>(`${apiPrefix}/settings/plugin-registries`)
    const data = (res.data ?? {}) as Record<string, unknown>
    const registries = Array.isArray(data.registries) ? data.registries : []
    return registries.map((r: unknown) => {
      const item = r as Record<string, unknown>
      return {
        url: String(item.url ?? ''),
        name: item.name as string | undefined,
        token: item.token as string | undefined,
        enabled: item.enabled !== false,
      }
    })
  }

  async updatePluginRegistries(registries: PluginRegistryConfig[]): Promise<void> {
    await this.client.put(`${apiPrefix}/settings/plugin-registries`, {
      registries: registries.map((r) => ({
        url: r.url,
        name: r.name ?? '',
        token: r.token ?? '',
        enabled: r.enabled !== false,
      })),
    })
  }
}
