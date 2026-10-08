import { describe, expect, test, vi } from 'vitest'

import type { Transport, TransportResponse } from '../../../core/network/http-client.js'
import { GithubDiscoveryApi } from '../api/github-discovery-api.js'
import { discoveryHasUpdate, hostCompatibility, installedFromRepository, isRepositoryMetadataUrl, parseGithubPluginManifest, releaseDownload } from '../domain/github-plugin-validation.js'
import { parseJSPlugin } from '../../../models/jsplugin.js'

const repo = {
  id: 1, full_name: 'alice/music', default_branch: 'develop', private: false,
  archived: false, fork: false, topics: ['songloft-plugin'], stargazers_count: 12,
}
const download = 'https://github.com/alice/music/releases/download/v2026.10.8/music.jsplugin.zip'
const manifest = {
  name: '音乐插件', version: '2026.10.8', entryPath: 'music', main: 'main.js', permissions: [],
  entryHash: 'a'.repeat(64), zipHash: 'b'.repeat(64), download_url: download,
}
const release = {
  draft: false, prerelease: false, tag_name: 'v2026.10.8', published_at: '2026-10-08T00:00:00Z',
  assets: [{ name: 'music.jsplugin.zip', browser_download_url: download, size: 1234, state: 'uploaded' }],
}
const json = (value: unknown, status = 200, headers = {}): TransportResponse => ({ status, headers, body: JSON.stringify(value) })
function fixture(overrides: { manifest?: unknown; release?: unknown; repos?: unknown[]; route?: (url: string) => TransportResponse | undefined } = {}) {
  const transport = vi.fn<Transport>(async request => {
    const other = overrides.route?.(request.url)
    if (other) return other
    if (request.url.startsWith('https://api.github.com/search/repositories')) return json({ total_count: 1, incomplete_results: false, items: overrides.repos ?? [repo] })
    if (request.url === 'https://raw.githubusercontent.com/alice/music/develop/plugin.json') return json(overrides.manifest ?? manifest)
    if (request.url === 'https://api.github.com/repos/alice/music/releases/tags/v2026.10.8') return json(overrides.release ?? release)
    return json({}, 404)
  })
  const api = new GithubDiscoveryApi(transport, () => 1000)
  const input = { page: 1, search: '', sort: 'updated' as const, proxy: '' }
  return { transport, api, input }
}

test('native discovery works without the browser URL constructor', async () => {
  vi.stubGlobal('URL', undefined)
  try {
    const { api, input } = fixture()
    const result = await api.discover(input)
    expect(result.plugins).toHaveLength(1)
    expect(result.failures).toEqual({})
    expect(releaseDownload(download, 'alice/music')).toEqual({ tag: 'v2026.10.8', file: 'music.jsplugin.zip' })
    expect(isRepositoryMetadataUrl('https://raw.githubusercontent.com/alice/music/main/plugin.json', 'alice/music')).toBe(true)
    for (const address of [download.replace('/v2026.10.8/', '/%2e%2e/'), download.replace('github.com', 'user@github.com'),
      download.replace('github.com', 'github.com:443'), `${download}?token=abc`, `${download}#fragment`,
      download.replace('alice/music', 'alice/other'), download.replace('github.com', 'github.com.evil')]) {
      expect(releaseDownload(address, 'alice/music')).toBeNull()
    }
  } finally { vi.unstubAllGlobals() }
})

test('discovers topic repositories through their actual default branch and stable release assets without server credentials', async () => {
  const { api, transport, input } = fixture()
  const result = await api.discover(input)
  expect(result.plugins).toHaveLength(1)
  expect(result.plugins[0]?.repository.fullName).toBe('alice/music')
  expect(result.plugins[0]?.downloadUrl).toBe(download)
  expect(result.checked).toBe(1)
  expect(result.failures).toEqual({})
  const requests = transport.mock.calls.map(([request]) => request)
  expect(requests[0]?.url).toContain(encodeURIComponent('topic:songloft-plugin archived:false fork:false'))
  expect(requests[1]?.url).toContain('/develop/plugin.json')
  expect(requests.every(request => request.headers.Authorization === undefined && request.timeoutMs === 15_000)).toBe(true)
})

describe('manifest contract', () => {
  test.each(['0.17.0', '2026.10.8'])('release tag does not constrain manifest version %s', async version => {
    const url = download.replace('/v2026.10.8/', '/v0.17/')
    const { api, input } = fixture({
      manifest: { ...manifest, version, download_url: url },
      route: address => address.endsWith('/releases/tags/v0.17') ? json({
        ...release, tag_name: 'v0.17', assets: [{ ...release.assets[0], browser_download_url: url }],
      }) : undefined,
    })
    expect((await api.discover(input)).plugins[0]?.manifest.version).toBe(version)
  })
  test.each([
    { entryHash: null }, { zipHash: 'bad' }, { permissions: null }, { permissions: [42] },
    { entryPath: '../evil' }, { main: '../main.js' }, { renderEngine: 'react' }, { version: 'dev' },
    { name: 'a' }, { name: '歌'.repeat(17) },
  ])('filters invalid required fields %j', async changes => {
    const { api, input } = fixture({ manifest: { ...manifest, ...changes } })
    const result = await api.discover(input)
    expect(result.plugins).toEqual([])
    expect(result.failures.invalidManifest).toBe(1)
  })
  test('supports native and default WebView manifests and non-empty UTF-8 names', () => {
    expect(parseGithubPluginManifest(manifest).renderEngine).toBe('')
    expect(parseGithubPluginManifest({ ...manifest, renderEngine: 'lynx', main: 'main.jsc' }).renderEngine).toBe('lynx')
  })
})

test.each([
  { prerelease: true }, { draft: true }, { tag_name: 'v2.0.0' }, { published_at: 'invalid' },
  { assets: [{ ...release.assets[0], browser_download_url: 'https://example.com/package.zip' }] },
  { assets: [{ ...release.assets[0], state: 'new' }] },
])('rejects mismatched/unpublished release %j', async changes => {
  const { api, input } = fixture({ release: { ...release, ...changes } })
  const result = await api.discover(input)
  expect(result.plugins).toEqual([])
  expect(Object.values(result.failures).reduce((a, b) => a + b, 0)).toBe(1)
})

test('rejects topic impostors, forks and archives before fetching manifests', async () => {
  const { api, transport, input } = fixture({ repos: [{ ...repo, topics: [] }, { ...repo, fork: true }, { ...repo, archived: true }] })
  expect((await api.discover(input)).plugins).toEqual([])
  expect(transport).toHaveBeenCalledTimes(1)
})

test('follows legacy update metadata with the same version, never replaces a release URL with latest', async () => {
  const updateUrl = 'https://raw.githubusercontent.com/alice/music/develop/manifest.json'
  const { api, input } = fixture({ manifest: { ...manifest, download_url: '', updateUrl },
    route: url => url === updateUrl ? json({ version: manifest.version, download_url: download }) : undefined })
  expect((await api.discover(input)).plugins).toHaveLength(1)
})

test('rejects update metadata that changes the plugin version', async () => {
  const updateUrl = 'https://raw.githubusercontent.com/alice/music/develop/manifest.json'
  const { api, input } = fixture({ manifest: { ...manifest, download_url: '', updateUrl },
    route: url => url === updateUrl ? json({ version: '2.0.0', download_url: download }) : undefined })
  expect((await api.discover(input)).failures.invalidRelease).toBe(1)
})

test('rejects external links, update cycles, and credentials without requesting them', async () => {
  for (const updateUrl of ['https://example.com/bob/music/main/plugin.json', 'https://raw.githubusercontent.com/alice/music/develop/plugin.json', 'https://user:pass@raw.githubusercontent.com/alice/music/main/plugin.json']) {
    const { api, transport, input } = fixture({ manifest: { ...manifest, download_url: '', updateUrl } })
    expect((await api.discover(input)).failures.invalidManifest).toBe(1)
    expect(transport).toHaveBeenCalledTimes(2)
  }
  expect(releaseDownload('https://github.com/bob/music/releases/download/v2026.10.8/music.jsplugin.zip', 'alice/music')).toBeNull()
})

test('keeps network failures separate from nonconforming repositories', async () => {
  const { api, input } = fixture({ route: url => url.includes('raw.githubusercontent.com') ? json({}, 502) : undefined })
  const result = await api.discover(input)
  expect(result.failures.unavailable).toBe(1)
  expect(result.failures.invalidManifest).toBeUndefined()
})

test('malformed or oversized plugin JSON is excluded rather than treated as an outage', async () => {
  for (const body of ['{broken', JSON.stringify({ text: 'a'.repeat(2 * 1024 * 1024) })]) {
    const { api, input } = fixture({ route: url => url.includes('raw.githubusercontent.com') ? { status: 200, headers: {}, body } : undefined })
    expect((await api.discover(input)).failures.invalidManifest).toBe(1)
  }
})

test('stops new verification requests on rate limiting and reports the reset time', async () => {
  const { api, input, transport } = fixture({
    route: url => url.includes('raw.githubusercontent.com') ? json({ message: 'API rate limit exceeded' }, 403, { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '99' }) : undefined,
    repos: Array.from({ length: 20 }, (_, index) => ({ ...repo, id: index + 1 })),
  })
  const result = await api.discover(input)
  expect(result.incomplete).toBe(true)
  expect(result.retryAt).toBe(99_000)
  expect(result.nextPage).toBeUndefined()
  expect(transport.mock.calls.length).toBeLessThanOrEqual(4)
})

test('reuses verified metadata but manual refresh validates it again', async () => {
  const { api, input, transport } = fixture()
  await api.discover(input)
  await api.discover(input)
  expect(transport).toHaveBeenCalledTimes(4)
  await api.discover({ ...input, force: true })
  expect(transport).toHaveBeenCalledTimes(7)
})

test('failed proxy requests fall back to the identical direct URL', async () => {
  const { api, input, transport } = fixture({ route: url => url.startsWith('https://proxy.example/') ? json({}, 502) : undefined })
  expect((await api.discover({ ...input, proxy: 'https://proxy.example/' })).plugins).toHaveLength(1)
  const addresses = transport.mock.calls.map(([request]) => request.url)
  expect(addresses).toHaveLength(6)
  for (let i = 0; i < addresses.length; i += 2) expect(addresses[i]).toBe(`https://proxy.example/${addresses[i + 1]}`)
})

test('honours abort before scheduling repository validation', async () => {
  const { api, input, transport } = fixture()
  const signal = new AbortController()
  signal.abort()
  await expect(api.discover({ ...input, signal: signal.signal })).rejects.toThrow()
  expect(transport).toHaveBeenCalledTimes(0)
})

test('host compatibility compares the connected server rather than the client', () => {
  expect(hostCompatibility('2.9.5', '2.9.4')).toBe('incompatible')
  expect(hostCompatibility('2.9.5', 'v2.10.0')).toBe('compatible')
  for (const minimum of ['2.9.5', '999.0.0', 'future']) {
    expect(hostCompatibility(minimum, 'dev')).toBe('compatible')
  }
  expect(hostCompatibility('2.9.5', undefined)).toBe('unknown')
  expect(hostCompatibility('2.9.5', 'unknown')).toBe('unknown')
  expect(hostCompatibility('', undefined)).toBe('compatible')
})

test('installed repository identity comes from update/download URLs, never the author or homepage', async () => {
  const { api, input } = fixture()
  const plugin = (await api.discover(input)).plugins[0]!
  const installed = parseJSPlugin({ id: 1, entry_path: 'music', version: '2026.10.7', update_url: 'https://github.com/alice/music/raw/main/plugin.json' })
  expect(installedFromRepository(plugin, installed)).toBe(true)
  expect(discoveryHasUpdate(plugin, installed)).toBe(true)
  expect(installedFromRepository(plugin, parseJSPlugin({ ...installed, entry_path: 'music', author: 'Alice', homepage: 'https://github.com/alice/music', update_url: 'https://github.com/bob/music/raw/main/plugin.json' }))).toBe(false)
})

test('reports validated plugins progressively while a different repository is still pending', async () => {
  let releaseSlow: (() => void) | undefined
  const slow = new Promise<void>(resolve => { releaseSlow = resolve })
  const transport: Transport = async request => {
    if (request.url.includes('/search/repositories')) return json({ total_count: 2, items: [repo, { ...repo, id: 2, full_name: 'bob/slow' }] })
    if (request.url.includes('bob/slow')) { await slow; return json({}, 404) }
    if (request.url.includes('raw.githubusercontent.com')) return json(manifest)
    return json(release)
  }
  const onProgress = vi.fn()
  const pending = new GithubDiscoveryApi(transport).discover({ page: 1, search: '', sort: 'updated', proxy: '', onProgress })
  for (let i = 0; i < 20; i++) await Promise.resolve()
  expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({ checked: 1, plugins: [expect.objectContaining({ downloadUrl: download })] }))
  releaseSlow?.()
  expect((await pending).checked).toBe(2)
})

test('verifies cross-repository packages against the target release, including legacy metadata on native runtimes', async () => {
  vi.stubGlobal('URL', undefined)
  try {
    const url = download.replace('alice/music', 'bob/music')
    const updateUrl = 'https://raw.githubusercontent.com/bob/music/main/update.json'
    for (const legacy of [false, true]) {
      const { api, input, transport } = fixture({
        manifest: { ...manifest, download_url: legacy ? '' : url, updateUrl },
        route: address => address === updateUrl ? json({ version: manifest.version, entryPath: manifest.entryPath, download_url: url })
          : address === 'https://api.github.com/repos/bob/music/releases/tags/v2026.10.8' ? json({ ...release, assets: [{ ...release.assets[0], browser_download_url: url }] }) : undefined,
      })
      const result = await api.discover(input)
      const plugin = result.plugins[0]!
      expect(result.failures).toEqual({})
      expect(plugin.repository.fullName).toBe('alice/music')
      expect(plugin.releaseUrl).toBe('https://github.com/bob/music/releases/tag/v2026.10.8')
      expect(transport.mock.calls.some(([request]) => request.url.includes('/repos/alice/music/releases/'))).toBe(false)
      expect(installedFromRepository(plugin, parseJSPlugin({ entry_path: 'music', download_url: url, version: manifest.version }))).toBe(true)
      expect(installedFromRepository(plugin, parseJSPlugin({ entry_path: 'music', download_url: url.replace('bob/music', 'carol/music'), version: manifest.version }))).toBe(false)
    }
  } finally { vi.unstubAllGlobals() }
})

test.each([{ entryHash: '', zipHash: '' }, { entryHash: undefined, zipHash: undefined }])('discovers repositories with empty or omitted root hashes %j', async hashes => {
  const { api, input } = fixture({ manifest: { ...manifest, ...hashes } })
  expect((await api.discover(input)).plugins).toHaveLength(1)
})
