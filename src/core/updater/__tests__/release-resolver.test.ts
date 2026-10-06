import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, test, vi } from 'vitest'
import { compareRelease, RELEASE_REPOSITORY, ReleaseResolver, releasePage, withGithubProxy } from '../release-resolver.js'
import type { BuildIdentity, ReleaseManifest } from '../update-contract.js'

const vector = JSON.parse(readFileSync(resolve(__dirname, '../../../../updates/fixtures/signature-v1.json'), 'utf8'))
const original: ReleaseManifest = JSON.parse(vector.raw_manifest)
const identity = (patch: Partial<BuildIdentity> = {}): BuildIdentity => ({ ...original, ...patch })
function release(manifest: ReleaseManifest = original) {
  return { id: 1, draft: false, prerelease: manifest.channel === 'dev', tag_name: manifest.release_tag,
    published_at: '2026-10-06T00:00:00Z', updated_at: '2026-10-06T00:00:00Z', body: '发布说明',
    assets: [...manifest.assets, { name: 'version.json', size: JSON.stringify(manifest).length }, { name: 'version.json.sig', size: 600 }]
      .map((asset, index) => ({ ...asset, id: index + 1, updated_at: '2026-10-06T00:00:00Z',
        browser_download_url: `${RELEASE_REPOSITORY}/releases/download/${manifest.release_tag}/${asset.name}` })) }
}
function transport(manifest: ReleaseManifest = original) {
  let apiCount = 0
  const data = release(manifest)
  const fn = vi.fn(async (url: string, _max: number) => {
    if (url.includes('api.github.com')) { apiCount++; return { status: 200, body: JSON.stringify(data) } }
    return { status: 200, body: url.includes('version.json.sig') ? JSON.stringify(vector.envelope) : JSON.stringify(manifest) }
  })
  return { fn, data, count: () => apiCount }
}
describe('channel version comparison', () => {
  test.each([
    ['abcdef0', 'abcdef0', 'current'], ['abcdef0', '1234567', 'newer'], ['ABCDEF0', 'abcdef0', 'current'],
  ])('dev commit %s versus %s: %s', (local, remote, result) => {
    expect(compareRelease(identity({ git_commit: local }), identity({ git_commit: remote, build_time: '2020-01-01T00:00:00.000Z' }))).toBe(result)
  })
  test.each([[599999, 'current'], [600000, 'newer'], [600001, 'newer'], [-600000, 'current'], [0, 'current']])('missing commit time difference %s: %s', (difference, result) => {
    const time = Date.parse(original.build_time)
    expect(compareRelease(identity({ git_commit: 'unknown' }), identity({ build_time: new Date(time + Number(difference)).toISOString() }))).toBe(result)
  })
  test('unknown timestamps, preview and different channels do not claim current', () => {
    expect(compareRelease(identity({ git_commit: '', build_time: 'unknown' }), original)).toBe('unknown')
    expect(compareRelease(identity({ channel: 'stable' }), original)).toBe('unknown')
    expect(compareRelease(identity({ channel: 'preview' }), identity({ channel: 'preview' }))).toBe('unknown')
    expect(releasePage('preview')).toBeNull()
  })
  test.each([['1.9.0', '1.10.0', 'newer'], ['1.10.0', '1.9.0', 'current'], ['1.10.0', '1.10.0', 'current'],
    ['1.10.0', '1.11.0-beta', 'unknown'], ['dev', '1.10.0', 'unknown']])('stable %s versus %s: %s', (local, remote, result) => {
    expect(compareRelease(identity({ channel: 'stable', version: local }), identity({ channel: 'stable', version: remote }))).toBe(result)
  })
})
describe('public release resolution', () => {
  test('dev reads only the dev tag, then verifies its revision; caches briefly and deduplicates concurrent reads', async () => {
    const env = transport(), clock = { now: 100 }, resolver = new ReleaseResolver(env.fn, () => clock.now)
    const [first, duplicate] = await Promise.all([resolver.resolve({ channel: 'dev' }), resolver.resolve({ channel: 'dev' })])
    expect(duplicate).toBe(first); expect(env.count()).toBe(2)
    expect(env.fn.mock.calls.filter(([url]) => url.includes('api.github.com')).every(([url]) => url.includes('/tags/dev?'))).toBe(true)
    expect(await resolver.resolve({ channel: 'dev' })).toBe(first)
    expect(env.count()).toBe(2)
    clock.now += 60_001
    await resolver.resolve({ channel: 'dev' }); expect(env.count()).toBe(4)
    await resolver.resolve({ channel: 'dev', force: true }); expect(env.count()).toBe(6)
  })
  test('stable reads latest once and never consults dev, previews or release history', async () => {
    const manifest = { ...original, channel: 'stable' as const, version: '1.10.0', release_tag: 'v1.10.0', bundle_update: null }
    const env = transport(manifest)
    expect((await new ReleaseResolver(env.fn).resolve({ channel: 'stable' })).manifest.version).toBe('1.10.0')
    expect(env.count()).toBe(1)
    expect(env.fn.mock.calls[0][0]).toContain('/latest?')
    expect(env.fn.mock.calls.some(([url]) => url.includes('/tags/dev'))).toBe(false)
  })
  test.each([['draft', true], ['prerelease', true], ['tag_name', 'v1.10.0-beta']])('stable rejects %s=%s', async (key, value) => {
    const manifest = { ...original, channel: 'stable' as const, version: '1.10.0', release_tag: 'v1.10.0', bundle_update: null }
    const env = transport(manifest)
    Object.assign(env.data, { [key]: value })
    await expect(new ReleaseResolver(env.fn).resolve({ channel: 'stable' })).rejects.toThrow('invalid_release')
    expect(env.count()).toBe(1)
  })
  test.each([[404, 'release_unpublished'], [403, 'release_rate_limited'], [429, 'release_rate_limited'], [500, 'metadata_failed']])('status %s reports %s without changing channels', async (status, message) => {
    const fn = vi.fn(async () => ({ status: Number(status), body: '{}' }))
    await expect(new ReleaseResolver(fn).resolve({ channel: 'dev' })).rejects.toThrow(String(message))
    expect(fn).toHaveBeenCalledTimes(1)
  })
  test('missing version metadata and mismatched channels fail without following unrelated download URLs', async () => {
    const missing = transport(); missing.data.assets = []
    await expect(new ReleaseResolver(missing.fn).resolve({ channel: 'dev' })).rejects.toThrow('release_missing_asset')
    const mismatch = transport(); mismatch.data.assets[0].browser_download_url = 'https://other.example/bundle'
    await expect(new ReleaseResolver(mismatch.fn).resolve({ channel: 'dev' })).rejects.toThrow('invalid_release')
    expect(mismatch.fn.mock.calls.every(([url]) => !url.includes('other.example'))).toBe(true)
  })
  test('bad manifest JSON reports invalid_release, while a listed signature returning 404 permits only package fallback', async () => {
    const env = transport()
    const broken = vi.fn(async (url: string, max: number) => url.includes('/version.json?')
      ? { status: 200, body: 'broken JSON' } : env.fn(url, max))
    await expect(new ReleaseResolver(broken).resolve({ channel: 'dev' })).rejects.toThrow('invalid_release')
    const missingSignature = vi.fn(async (url: string, max: number) => url.includes('/version.json.sig?')
      ? { status: 404, body: '' } : env.fn(url, max))
    expect((await new ReleaseResolver(missingSignature).resolve({ channel: 'dev' })).signature).toBeNull()
  })
  test('a dev release revision change retries once; a second change reports release_changed', async () => {
    const env = transport()
    let reads = 0
    const fn = vi.fn(async (url: string, max: number) => {
      if (url.includes('api.github.com')) {
        reads++
        return { status: 200, body: JSON.stringify({ ...env.data, updated_at: String(reads) }) }
      }
      return env.fn(url, max)
    })
    await expect(new ReleaseResolver(fn).resolve({ channel: 'dev' })).rejects.toThrow('release_changed')
    expect(reads).toBe(4)
    expect(fn.mock.calls.every(([url]) => !url.includes('/latest'))).toBe(true)
  })
  test('proxy failures retry the exact direct address and API/download requests use their own URLs', async () => {
    const env = transport()
    const fn = vi.fn(async (url: string, max: number) => url.startsWith('https://proxy.example/') ? { status: 502, body: '' } : env.fn(url, max))
    await new ReleaseResolver(fn).resolve({ channel: 'dev', proxy: 'https://proxy.example' })
    for (let index = 0; index < fn.mock.calls.length; index += 2) {
      expect(fn.mock.calls[index][0]).toBe(`https://proxy.example/${fn.mock.calls[index + 1][0]}`)
    }
    for (const invalid of ['http://proxy.example', 'https://user:pass@proxy.example', 'https://proxy.example/?token=secret']) {
      expect(() => withGithubProxy('https://api.github.com/test', invalid)).toThrow('invalid_update_proxy')
    }
  })
})
