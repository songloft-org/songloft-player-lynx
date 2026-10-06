import { compareStableVersions, parseReleaseManifest, type BuildIdentity, type ReleaseManifest } from './update-contract.js'

export const RELEASE_REPOSITORY = 'https://github.com/songloft-org/songloft-player-lynx'
const RELEASE_API = 'https://api.github.com/repos/songloft-org/songloft-player-lynx/releases'
export type ReleaseChannel = 'dev' | 'stable'
export type VersionComparison = 'newer' | 'current' | 'unknown'
export type MetadataFetch = (url: string, maxBytes: number) => Promise<{ status: number; body: string }>
interface ReleaseAsset { id: number; name: string; size: number; browser_download_url: string; updated_at: string; digest?: string }
interface Release { id: number; tag_name: string; published_at: string; updated_at: string; body: string; assets: ReleaseAsset[] }
export interface ReleaseCandidate {
  manifest: ReleaseManifest
  rawManifest: string
  signature: string | null
  release: Release
  proxy: string
}
export function releasePage(channel: BuildIdentity['channel']): string | null {
  return channel === 'dev' ? `${RELEASE_REPOSITORY}/releases/tag/dev`
    : channel === 'stable' ? `${RELEASE_REPOSITORY}/releases/latest` : null
}
export function compareRelease(current: BuildIdentity, candidate: BuildIdentity): VersionComparison {
  if (current.channel !== candidate.channel || current.channel === 'preview') return 'unknown'
  if (current.channel === 'stable') {
    const value = compareStableVersions(candidate.version, current.version)
    return value == null ? 'unknown' : value > 0 ? 'newer' : 'current'
  }
  const validCommit = (value: string) => /^[0-9a-f]{7,40}$/i.test(value)
  if (validCommit(current.git_commit) && validCommit(candidate.git_commit)) {
    return current.git_commit.toLowerCase() === candidate.git_commit.toLowerCase() ? 'current' : 'newer'
  }
  const time = (value: string) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) ? Date.parse(value) : NaN
  const local = time(current.build_time), remote = time(candidate.build_time)
  return !Number.isFinite(local) || !Number.isFinite(remote) ? 'unknown' : remote - local >= 600_000 ? 'newer' : 'current'
}
/** Match the existing configured GitHub prefix convention; metadata and download URLs stay distinct. */
export function withGithubProxy(address: string, proxy: string): string {
  if (!proxy) return address
  // Native transport performs the final URL check. Reject credentials, query strings and unsafe prefixes here too.
  if (!/^https:\/\/[a-z0-9.-]+(?::[0-9]{1,5})?(?:\/[^\s?#@\\]*)?$/i.test(proxy)) throw new Error('invalid_update_proxy')
  return `${proxy.endsWith('/') ? proxy : `${proxy}/`}${address}`
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid_release')
  return value as Record<string, unknown>
}
function parseRelease(raw: string, channel: ReleaseChannel): Release {
  let data: Record<string, unknown>
  try { data = record(JSON.parse(raw)) } catch { throw new Error('invalid_release') }
  const tag = data.tag_name
  if (data.draft !== false || typeof tag !== 'string' ||
    (channel === 'dev' ? tag !== 'dev' : data.prerelease !== false || !/^v\d+\.\d+\.\d+$/.test(tag) || compareStableVersions(tag.slice(1), tag.slice(1)) == null) ||
    !Number.isSafeInteger(data.id) || typeof data.body !== 'string' && data.body !== null ||
    typeof data.published_at !== 'string' || typeof data.updated_at !== 'string' || !Array.isArray(data.assets) || data.assets.length > 32)
    throw new Error('invalid_release')
  const assets = data.assets.map(value => {
    const asset = record(value)
    if (!Number.isSafeInteger(asset.id) || typeof asset.name !== 'string' || !/^[A-Za-z0-9._-]+$/.test(asset.name) ||
      !Number.isSafeInteger(asset.size) || Number(asset.size) <= 0 || typeof asset.updated_at !== 'string' ||
      asset.browser_download_url !== `${RELEASE_REPOSITORY}/releases/download/${tag}/${asset.name}` ||
      (asset.digest != null && (typeof asset.digest !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(asset.digest)))) throw new Error('invalid_release')
    return asset as unknown as ReleaseAsset
  })
  if (new Set(assets.map(asset => asset.name)).size !== assets.length) throw new Error('invalid_release')
  return { id: data.id as number, tag_name: tag, body: (data.body ?? '') as string,
    published_at: data.published_at, updated_at: data.updated_at, assets }
}
function revision(release: Release): string {
  return JSON.stringify([release.id, release.tag_name, release.updated_at,
    release.assets.map(asset => [asset.id, asset.name, asset.size, asset.updated_at, asset.digest]).sort((a, b) => String(a[1]).localeCompare(String(b[1])))])
}
function failStatus(status: number): void {
  if (status === 403 || status === 429) throw new Error('release_rate_limited')
  if (status === 404) throw new Error('release_unpublished')
  if (status < 200 || status >= 300) throw new Error('metadata_failed')
}
export function releaseAsset(candidate: ReleaseCandidate, name: string): ReleaseAsset | null {
  const listed = candidate.manifest.assets.find(asset => asset.name === name)
  const remote = candidate.release.assets.find(asset => asset.name === name)
  return listed && remote && listed.size === remote.size && (!remote.digest || remote.digest === `sha256:${listed.sha256}`) ? remote : null
}
/** Cache only public release data. Host identity/compatibility is reevaluated at every check. */
export class ReleaseResolver {
  private readonly cache = new Map<string, { value: ReleaseCandidate; until: number }>()
  private readonly inflight = new Map<string, Promise<ReleaseCandidate>>()
  constructor(private readonly fetchMetadata: MetadataFetch, private readonly now: () => number = Date.now) {}
  resolve(input: { channel: ReleaseChannel; proxy?: string; force?: boolean }): Promise<ReleaseCandidate> {
    const proxy = input.proxy ?? '', key = `${input.channel}|${proxy}`
    const cached = this.cache.get(key)
    if (!input.force && cached && cached.until > this.now()) return Promise.resolve(cached.value)
    const existing = this.inflight.get(key)
    if (existing) return existing
    const task = this.read(input.channel, proxy).then(value => {
      this.cache.set(key, { value, until: this.now() + 60_000 }); return value
    }).finally(() => { this.inflight.delete(key) })
    this.inflight.set(key, task)
    return task
  }
  private async get(address: string, maximum: number, proxy: string): Promise<string> {
    const proxied = withGithubProxy(address, proxy)
    let response: { status: number; body: string }
    try {
      response = await this.fetchMetadata(proxied, maximum)
      failStatus(response.status)
    } catch (error) {
      if (proxied === address) throw error
      // Same URL/channel only. A failed proxy never changes the release candidate.
      response = await this.fetchMetadata(address, maximum)
      failStatus(response.status)
    }
    if (response.body.length > maximum) throw new Error('metadata_too_large')
    return response.body
  }
  private async read(channel: ReleaseChannel, proxy: string): Promise<ReleaseCandidate> {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const api = `${RELEASE_API}/${channel === 'dev' ? 'tags/dev' : 'latest'}?_cb=${this.now()}-${attempt}`
        const release = parseRelease(await this.get(api, 524288, proxy), channel)
        const metadata = release.assets.find(asset => asset.name === 'version.json')
        if (!metadata || metadata.size > 131072) throw new Error('release_missing_asset')
        const rawManifest = await this.file(`${metadata.browser_download_url}?_cb=${this.now()}-${attempt}`, 131072, proxy)
        let manifest: ReleaseManifest
        try { manifest = parseReleaseManifest(JSON.parse(rawManifest)) } catch { throw new Error('invalid_release') }
        if (manifest.channel !== channel || manifest.release_tag !== release.tag_name) throw new Error('invalid_release')
        const signatureAsset = release.assets.find(asset => asset.name === 'version.json.sig')
        const signature = manifest.bundle_update && signatureAsset && signatureAsset.size <= 8192
          ? await this.file(`${signatureAsset.browser_download_url}?_cb=${this.now()}-${attempt}`, 8192, proxy)
            .catch(error => { if ((error as Error).message === 'release_missing_asset') return null; throw error }) : null
        const candidate = { manifest, rawManifest, signature, release, proxy }
        for (const asset of manifest.assets) {
          if (!releaseAsset(candidate, asset.name)) throw new Error('release_changed')
        }
        if (channel === 'dev') {
          const after = parseRelease(await this.get(`${api}&_verify=1`, 524288, proxy), channel)
          if (revision(release) !== revision(after)) throw new Error('release_changed')
        }
        return candidate
      } catch (error) {
        if (channel !== 'dev' || attempt === 1 || !['release_changed', 'invalid_release', 'release_missing_asset'].includes((error as Error).message)) throw error
      }
    }
    throw new Error('release_changed')
  }
  private async file(address: string, maximum: number, proxy: string): Promise<string> {
    try { return await this.get(address, maximum, proxy) }
    catch (error) { if ((error as Error).message === 'release_unpublished') throw new Error('release_missing_asset'); throw error }
  }
}
