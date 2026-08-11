import { apiPrefix } from '../../../core/config/app-config.js'
import type { HttpClient } from '../../../core/network/http-client.js'
import {
  parseJSPlugin,
  parseJSPluginListResponse,
  parseRegistryRefreshResponse,
  type JSPlugin,
  type JSPluginListResponse,
  type RegistryRefreshResponse,
} from '../../../models/jsplugin.js'

export interface RegistryRefreshParams {
  registryUrl?: string
  allSources?: boolean
  page?: number
  pageSize?: number
  search?: string
  force?: boolean
}

export interface InstallFromRegistryParams {
  downloadUrl: string
  sourceUrl?: string
  overwrite?: boolean
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

  async checkUpdate(id: number): Promise<{ hasUpdate: boolean; currentVersion: string; remoteVersion: string }> {
    const res = await this.client.get<unknown>(`${apiPrefix}/jsplugins/${id}/check-update`)
    const data = res.data as Record<string, unknown> | undefined
    return {
      hasUpdate: (data?.has_update as boolean) ?? false,
      currentVersion: (data?.current_version as string) ?? '',
      remoteVersion: (data?.remote_version as string) ?? '',
    }
  }

  async updatePlugin(id: number, force = false): Promise<void> {
    const body: Record<string, unknown> = {}
    if (force) body.force = true
    await this.client.post(`${apiPrefix}/jsplugins/${id}/update`, body)
  }

  async updateAllPlugins(force = false): Promise<{ total: number; updated: number; failed: number }> {
    const body: Record<string, unknown> = {}
    if (force) body.force = true
    const res = await this.client.post<unknown>(`${apiPrefix}/jsplugins/update-all`, body)
    const data = res.data as Record<string, unknown> | undefined
    return {
      total: Number(data?.total ?? 0),
      updated: Number(data?.updated ?? 0),
      failed: Number(data?.failed ?? 0),
    }
  }

  async refreshRegistry(params: RegistryRefreshParams = {}): Promise<RegistryRefreshResponse> {
    const body: Record<string, unknown> = {
      page: params.page ?? 1,
      page_size: params.pageSize ?? 20,
    }
    if (params.allSources) body.all_sources = true
    else if (params.registryUrl) body.registry_url = params.registryUrl
    if (params.search) body.search = params.search
    if (params.force) body.force = true
    const res = await this.client.post<unknown>(`${apiPrefix}/jsplugins/registry/refresh`, body)
    return parseRegistryRefreshResponse(res.data)
  }

  async installFromRegistry(params: InstallFromRegistryParams): Promise<void> {
    const body: Record<string, unknown> = { download_url: params.downloadUrl }
    if (params.sourceUrl) body.source_url = params.sourceUrl
    if (params.overwrite) body.overwrite = true
    await this.client.post(`${apiPrefix}/jsplugins/registry/install`, body)
  }
}
