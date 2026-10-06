import { expect, test } from 'vitest'
import { cacheIdentity, cacheNamespace, freezeCacheDownload, normalizeCacheServer, plannedCacheFormat } from '../domain/cache-identity.js'
import { parseSong } from '../../../models/song.js'

const song = parseSong({ id: 7, type: 'local', title: '歌曲', artist: '歌手', duration: 120, format: 'flac', url: '/api/v1/songs/7/play', updated_at: '2026-10-07T00:00:00Z' })
const scope = { profile: null, server: 'HTTPS://Example.COM:443/Music/', username: '用户' }
const variant = { track: null, quality: 'original', normalize: false } as const
test('server normalization preserves path case and rejects credential/query identities', () => {
  expect(normalizeCacheServer(scope.server)).toBe('https://example.com/Music')
  expect(normalizeCacheServer('http://EXAMPLE.com:80/')).toBe('http://example.com')
  for (const server of ['https://user:pass@example.com', 'https://example.com?token=secret', 'https://example.com#x', 'https://example.com\\bad']) {
    expect(() => normalizeCacheServer(server)).toThrow('invalid_cache_identity')
  }
})
test('same song IDs remain distinct across server, user, profile, track, quality, normalize and revision', () => {
  const namespace = cacheNamespace(scope)
  const key = cacheIdentity({ namespace, song, variant, format: 'flac' }).key
  const changed = [
    cacheIdentity({ namespace: cacheNamespace({ ...scope, server: 'https://two/Music' }), song, variant, format: 'flac' }).key,
    cacheIdentity({ namespace: cacheNamespace({ ...scope, username: '另一用户' }), song, variant, format: 'flac' }).key,
    cacheIdentity({ namespace: cacheNamespace({ ...scope, profile: 'other' }), song, variant, format: 'flac' }).key,
    cacheIdentity({ namespace, song, variant: { ...variant, track: 0 }, format: 'mp3' }).key,
    cacheIdentity({ namespace, song, variant: { ...variant, quality: '128' }, format: 'mp3' }).key,
    cacheIdentity({ namespace, song, variant: { ...variant, normalize: true }, format: 'mp3' }).key,
    cacheIdentity({ namespace, song: { ...song, updatedAt: 'later' }, variant, format: 'flac' }).key,
  ]
  expect(new Set([key, ...changed]).size).toBe(8)
})
test('normalization and quality use the transcoded container while AAC track extraction ignores requested quality', () => {
  expect(plannedCacheFormat({ song, variant, platform: 'android' })).toBe('flac')
  expect(plannedCacheFormat({ song, variant: { ...variant, normalize: true }, platform: 'android' })).toBe('mp3')
  expect(plannedCacheFormat({ song, variant: { ...variant, quality: '128' }, platform: 'android' })).toBe('mp3')
  const tracks = [{ index: 2, codec: 'aac', language: null, title: null, default: false }]
  expect(plannedCacheFormat({ song, variant: { ...variant, track: 2, quality: '128' }, platform: 'android', tracks })).toBe('m4a')
  expect(() => plannedCacheFormat({ song, variant: { ...variant, track: 0 }, platform: 'android', tracks })).toThrow('track_metadata_unavailable')
})
test('the frozen download uses explicit normalization, and persisted snapshot/identity excludes credentials and remote paths', () => {
  const context = { resolvedBaseUrl: 'https://example.com', basePath: '/Music', accessToken: 'secret' }
  const result = freezeCacheDownload({ scope, song: { ...song, filePath: '/private/file', coverUrl: 'https://example.com?token=secret' }, variant, platform: 'android', context, taskId: 'cache-test', maxBytes: 1024 })
  expect(result.url).toBe('https://example.com/Music/api/v1/songs/7/play?access_token=secret&normalize=0')
  context.accessToken = 'new-token'
  expect(result.url).toContain('access_token=secret')
  const persisted = JSON.stringify({ namespace: result.namespace, key: result.key, snapshot: result.snapshot })
  expect(persisted).not.toMatch(/secret|access_token|filePath|coverUrl|private|https:\/\/example.com\?/)
  expect(result.snapshot.title).toBe('歌曲')
})
test('radio, live sources, invalid IDs and unsafe format strings never produce a cache identity', () => {
  for (const source of [{ ...song, type: 'radio' as const }, { ...song, isLive: true }, { ...song, id: 0 }]) {
    expect(() => cacheIdentity({ namespace: cacheNamespace(scope), song: source, variant, format: 'mp3' })).toThrow()
  }
  expect(() => cacheIdentity({ namespace: cacheNamespace(scope), song, variant, format: '../x' })).toThrow()
})
