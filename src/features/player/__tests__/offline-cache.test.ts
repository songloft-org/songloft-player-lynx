import { expect, test } from 'vitest'
import { parseSong } from '../../../models/song.js'
import { cacheIdentity, cacheNamespace, cacheSnapshot } from '../domain/cache-identity.js'
import { cachedEntryQueue, cachedEntrySong, cachedSongIdentity, parseCacheSnapshot } from '../domain/offline-cache.js'
import type { CachedEntry } from '../data/indexed-song-cache.js'

const namespace = cacheNamespace({ profile: 'one', server: 'http://server/base', username: 'alice' })
function entry(id: number, track: number | null = null): CachedEntry {
  const song = parseSong({ id, title: `Song ${id}`, updated_at: 'revision', is_video: true, url: 'http://server?access_token=secret', cover_url: 'secret-cover' })
  return { ...cacheIdentity({ namespace, song, variant: { track, quality: '192', normalize: true }, format: 'm4a' }),
    cached: true, url: 'file:///private/media.m4a', sizeBytes: 1234, createdAt: 1, snapshot: cacheSnapshot(song) }
}
test('local songs contain only snapshot metadata and identity, with extracted audio rather than remote video', () => {
  const song = cachedEntrySong(entry(7, 1))
  expect(cachedSongIdentity(song)).toEqual({ namespace, key: entry(7, 1).key })
  expect(song).toMatchObject({ id: 7, format: 'm4a', isVideo: false })
  expect(JSON.stringify(song)).not.toMatch(/secret|file:\/\/|coverUrl|lyricUrl|sourceUrl|filePath/)
})
test('the selected cached variant wins deduplication and foreign namespaces never enter a queue', () => {
  const selected = entry(7, 1), other = entry(8)
  const foreign = { ...entry(9), namespace: 'other-user' }
  const queue = cachedEntryQueue([entry(7), selected, other, foreign], selected)
  expect(queue.playlist.map(song => song.id)).toEqual([7, 8])
  expect(queue.index).toBe(0)
  expect(cachedSongIdentity(queue.playlist[0])?.key).toBe(selected.key)
})
test('malformed IDs, media variants, foreign identities and snapshot revisions are rejected', () => {
  const value = entry(7), song = cachedEntrySong(value)
  expect(cachedSongIdentity({ ...song, id: 8 })).toBeNull()
  expect(cachedSongIdentity({ ...song, updatedAt: 'new-revision' })).toBeNull()
  const key = JSON.parse(value.key); key[2] = '-1'
  expect(cachedSongIdentity({ ...song, deviceCache: { namespace, key: JSON.stringify(key) } } as typeof song)).toBeNull()
  expect(() => cachedEntrySong({ ...value, snapshot: { ...value.snapshot, id: 8 } })).toThrow()
})
test('snapshot validation rejects malformed values and strips extra token-bearing fields', () => {
  const snapshot = entry(7).snapshot
  expect(parseCacheSnapshot({ ...snapshot, url: 'secret', token: 'secret' })).toEqual(snapshot)
  for (const value of [{ ...snapshot, duration: NaN }, { ...snapshot, isVideo: undefined }, { ...snapshot, artist: 3 }, { ...snapshot, id: 0 }]) {
    expect(() => parseCacheSnapshot(value)).toThrow('invalid_cache_response')
  }
})
test('Android JSON slash escaping and whitespace preserve the original native file key', () => {
  const value = entry(7, 1)
  const androidKey = value.key.replaceAll('/', '\\/')
  const song = cachedEntrySong({ ...value, key: androidKey })
  expect(cachedSongIdentity(song)?.key).toBe(androidKey)
  const spacedKey = JSON.stringify(JSON.parse(value.key), null, 2)
  expect(cachedSongIdentity(cachedEntrySong({ ...value, key: spacedKey }))?.key).toBe(spacedKey)
})
