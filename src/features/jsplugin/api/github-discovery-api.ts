import { createFetchTransport, type Transport, type TransportResponse } from '../../../core/network/http-client.js'
import { withGithubProxy } from '../../../core/updater/release-resolver.js'
import {
  isRepositoryMetadataUrl, parseGithubPluginManifest, releaseDownload, utf8Size,
  type GithubPlugin, type GithubRepository,
} from '../domain/github-plugin-validation.js'

export type DiscoveryFailure = 'invalidManifest' | 'unpublished' | 'invalidRelease' | 'unavailable' | 'rateLimited'
export class GithubDiscoveryError extends Error {
  constructor(readonly reason: DiscoveryFailure, readonly retryAt?: number) {
    super(reason)
  }
}
export interface GithubDiscoveryPageData {
  plugins: GithubPlugin[]
  checked: number
  failures: Partial<Record<DiscoveryFailure, number>>
  nextPage: number | undefined
  retryAt?: number
  incomplete: boolean
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new GithubDiscoveryError('unavailable')
  return value as Record<string, unknown>
}

export class GithubDiscoveryApi {
  private readonly cache = new Map<string, { until: number; plugin: GithubPlugin }>()
  constructor(private readonly transport: Transport = createFetchTransport(), private readonly now = Date.now) {}

  private checkStatus(response: TransportResponse): void {
    const headers = Object.fromEntries(Object.entries(response.headers).map(([key, value]) => [key.toLowerCase(), value]))
    if (response.status === 429 || response.status === 403 && (headers['x-ratelimit-remaining'] === '0'
      || headers['retry-after'] || /rate limit/i.test(response.body))) {
      const retry = Number(headers['retry-after']), reset = Number(headers['x-ratelimit-reset'])
      throw new GithubDiscoveryError('rateLimited', retry > 0 ? this.now() + retry * 1000 : reset > 0 ? reset * 1000 : undefined)
    }
    if (response.status === 404) throw new GithubDiscoveryError('unpublished')
    if (response.status < 200 || response.status >= 300) throw new GithubDiscoveryError('unavailable')
  }

  private async get({ address, proxy, maximum = 2 * 1024 * 1024, signal, invalidData = 'unavailable' }: { address: string; proxy: string; maximum?: number; signal?: AbortSignal; invalidData?: DiscoveryFailure }): Promise<unknown> {
    if (signal?.aborted) throw new GithubDiscoveryError('unavailable')
    const proxied = withGithubProxy(address, proxy)
    const send = async (url: string) => {
      const response = await this.transport({ url, method: 'GET', headers: { Accept: 'application/json' }, timeoutMs: 15_000 })
      if (signal?.aborted) throw new GithubDiscoveryError('unavailable')
      this.checkStatus(response)
      if (utf8Size(response.body) > maximum) throw new GithubDiscoveryError(invalidData)
      try { return JSON.parse(response.body) as unknown } catch { throw new GithubDiscoveryError(invalidData) }
    }
    try { return await send(proxied) }
    catch (error) {
      if (signal?.aborted || proxied === address || error instanceof GithubDiscoveryError && error.reason === 'rateLimited') throw error
      return send(address)
    }
  }

  async discover(input: { page: number; search: string; sort: 'updated' | 'stars'; proxy: string; force?: boolean; signal?: AbortSignal; onProgress?: (data: GithubDiscoveryPageData) => void }): Promise<GithubDiscoveryPageData> {
    // PrimJS main-thread bytecode does not support Unicode property escapes.
    const keyword = input.search.trim().replace(/[^\w\u0080-\uffff./ -]/g, '').slice(0, 100)
    const q = `topic:songloft-plugin archived:false fork:false${keyword ? ` ${keyword} in:name,description,readme` : ''}`
    const search = record(await this.get({ address: `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&sort=${input.sort}&order=desc&per_page=20&page=${input.page}`, proxy: input.proxy, signal: input.signal }))
    if (!Array.isArray(search.items) || typeof search.total_count !== 'number') throw new GithubDiscoveryError('unavailable')
    const repositories: GithubRepository[] = search.items.map(value => {
      const repo = record(value)
      if (!Number.isSafeInteger(repo.id) || typeof repo.full_name !== 'string'
        || !/^[a-z0-9_.-]+\/[a-z0-9_.-]+$/i.test(repo.full_name) || typeof repo.default_branch !== 'string'
        || !repo.default_branch || repo.archived !== false || repo.fork !== false || repo.private !== false
        || !Array.isArray(repo.topics) || !repo.topics.includes('songloft-plugin')) return null
      return { id: repo.id as number, fullName: repo.full_name, defaultBranch: repo.default_branch,
        stars: typeof repo.stargazers_count === 'number' ? repo.stargazers_count : 0, updatedAt: String(repo.updated_at ?? '') }
    }).filter((repo): repo is GithubRepository => repo !== null)
    const plugins: Array<GithubPlugin | undefined> = new Array(repositories.length)
    const failures: GithubDiscoveryPageData['failures'] = {}
    let cursor = 0, checked = 0, limited = false, retryAt: number | undefined
    const snapshot = (): GithubDiscoveryPageData => ({ plugins: plugins.filter((plugin): plugin is GithubPlugin => plugin != null),
      checked, failures: { ...failures }, retryAt,
      nextPage: limited ? undefined : input.page * 20 < Math.min(1000, search.total_count as number) ? input.page + 1 : undefined,
      incomplete: limited || search.incomplete_results === true })
    const workers = Array.from({ length: Math.min(3, repositories.length) }, async () => {
      while (cursor < repositories.length && !limited && !input.signal?.aborted) {
        const index = cursor++, repository = repositories[index]!
        try { plugins[index] = await this.verify({ repository, proxy: input.proxy, force: input.force, signal: input.signal }) }
        catch (error) {
          const reason = error instanceof GithubDiscoveryError ? error.reason : 'unavailable'
          failures[reason] = (failures[reason] ?? 0) + 1
          if (reason === 'rateLimited') { limited = true; retryAt = (error as GithubDiscoveryError).retryAt }
        }
        checked++
        if (!input.signal?.aborted) input.onProgress?.(snapshot())
      }
    })
    await Promise.all(workers)
    if (input.signal?.aborted) throw new GithubDiscoveryError('unavailable')
    return snapshot()
  }

  private async verify({ repository, proxy, force = false, signal }: { repository: GithubRepository; proxy: string; force?: boolean; signal?: AbortSignal }): Promise<GithubPlugin> {
    const key = `${repository.fullName}|${repository.defaultBranch}|${proxy}`
    const cached = this.cache.get(key)
    if (!force && cached && cached.until > this.now()) return { ...cached.plugin, repository }
    let address = `https://raw.githubusercontent.com/${repository.fullName}/${encodeURIComponent(repository.defaultBranch)}/plugin.json`
    const visited = new Set<string>()
    let manifest
    const raw = await this.get({ address, proxy, signal, invalidData: 'invalidManifest' })
    try { manifest = parseGithubPluginManifest(raw) } catch { throw new GithubDiscoveryError('invalidManifest') }
    visited.add(address)
    for (let depth = 0; !manifest.download_url && depth < 2; depth++) {
      address = manifest.updateUrl
      if (!address) throw new GithubDiscoveryError('unpublished')
      if (visited.has(address) || !isRepositoryMetadataUrl(address, repository.fullName)) throw new GithubDiscoveryError('invalidManifest')
      visited.add(address)
      // Legacy update metadata can be a minimal version/download_url document.
      const update = record(await this.get({ address, proxy, signal, invalidData: 'invalidManifest' }))
      if (update.version !== manifest.version || update.entryPath != null && update.entryPath !== manifest.entryPath) throw new GithubDiscoveryError('invalidRelease')
      if (typeof update.download_url === 'string' && update.download_url) {
        manifest = { ...manifest, download_url: update.download_url }
      } else if (typeof update.updateUrl === 'string') {
        manifest = { ...manifest, updateUrl: update.updateUrl }
      } else throw new GithubDiscoveryError('unpublished')
    }
    if (!manifest.download_url) throw new GithubDiscoveryError('invalidManifest')
    const download = releaseDownload(manifest.download_url, repository.fullName)
    if (!download) throw new GithubDiscoveryError('invalidRelease')
    const release = record(await this.get({ address: `https://api.github.com/repos/${repository.fullName}/releases/tags/${encodeURIComponent(download.tag)}`, proxy, signal }))
    if (release.draft !== false || release.prerelease !== false || release.tag_name !== download.tag
      || download.tag.replace(/^v/, '') !== manifest.version || !Array.isArray(release.assets)
      || typeof release.published_at !== 'string' || !Number.isFinite(Date.parse(release.published_at))) throw new GithubDiscoveryError('invalidRelease')
    const asset = release.assets.find(value => {
      const item = record(value)
      return item.name === download.file && item.browser_download_url === manifest.download_url
        && typeof item.size === 'number' && item.size > 0 && item.state === 'uploaded'
    })
    if (!asset) throw new GithubDiscoveryError('unpublished')
    const plugin: GithubPlugin = { repository, manifest, downloadUrl: manifest.download_url,
      releaseUrl: `https://github.com/${repository.fullName}/releases/tag/${encodeURIComponent(download.tag)}`, publishedAt: release.published_at }
    this.cache.set(key, { until: this.now() + 60 * 60 * 1000, plugin })
    if (this.cache.size > 500) this.cache.delete(this.cache.keys().next().value!)
    return plugin
  }
}

export const githubDiscoveryApi = new GithubDiscoveryApi()
