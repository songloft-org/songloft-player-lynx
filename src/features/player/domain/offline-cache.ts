import { parseSong, type Song } from '../../../models/song.js'
import { cacheNamespace, cacheIdentity, type CacheIdentity, type CacheSnapshot } from './cache-identity.js'
import type { CachedEntry } from '../data/indexed-song-cache.js'

export type CachedSong = Song & { deviceCache: CacheIdentity }
export function cachedSongIdentity(song: Song): CacheIdentity | null {
  const raw = (song as Partial<CachedSong>).deviceCache
  return parseCachedIdentity(raw, song)
}
export function parseCachedIdentity(raw: unknown, song: Song): CacheIdentity | null {
  try {
    if (!raw || typeof raw !== 'object') return null
    const value = raw as Partial<CacheIdentity>
    if (typeof value.namespace !== 'string' || typeof value.key !== 'string') return null
    const scope = JSON.parse(value.namespace) as unknown[]
    if (!Array.isArray(scope) || scope.length !== 3 || scope.some(field => typeof field !== 'string') ||
      cacheNamespace({ profile: scope[0] as string, server: scope[1] as string, username: scope[2] as string }) !== value.namespace) return null
    const key = JSON.parse(value.key) as string[]
    if (!Array.isArray(key) || key.length !== 7 || key.some(field => typeof field !== 'string') ||
      !['original', '320', '192', '128'].includes(key[3]) || !['0', '1'].includes(key[4]) ||
      key[2] !== 'default' && !/^(0|[1-9]\d*)$/.test(key[2])) return null
    const expected = cacheIdentity({ namespace: value.namespace, song,
      variant: { track: key[2] === 'default' ? null : Number(key[2]), quality: key[3] as 'original', normalize: key[4] === '1' }, format: key[6] })
    const expectedFields = JSON.parse(expected.key) as string[]
    // Android's org.json escapes slashes; native directories hash the original key bytes.
    // Compare decoded fields while preserving the exact native key for future file lookups.
    return expectedFields.every((field, index) => field === key[index]) ? { namespace: value.namespace, key: value.key } : null
  } catch { return null }
}

export function parseCacheSnapshot(raw: unknown): CacheSnapshot {
  if (!raw || typeof raw !== 'object') throw new Error('invalid_cache_response')
  const value = raw as Partial<CacheSnapshot>
  if (!Number.isSafeInteger(value.id) || value.id! <= 0 || !['local', 'remote'].includes(value.type ?? '') ||
    typeof value.title !== 'string' || typeof value.artist !== 'string' || typeof value.album !== 'string' ||
    typeof value.duration !== 'number' || !Number.isFinite(value.duration) || value.duration < 0 ||
    typeof value.isVideo !== 'boolean' || typeof value.format !== 'string' || typeof value.updatedAt !== 'string') throw new Error('invalid_cache_response')
  return { id: value.id!, type: value.type!, title: value.title, artist: value.artist, album: value.album,
    duration: value.duration, isVideo: value.isVideo, format: value.format, updatedAt: value.updatedAt }
}

/** Snapshot-only local audio; remote detail, cover, lyric and source URLs never enter this queue. */
export function cachedEntrySong(entry: CachedEntry): CachedSong {
  const snapshot = parseCacheSnapshot(entry.snapshot)
  const format = (JSON.parse(entry.key) as string[])[6]
  const song = parseSong({ id: snapshot.id, type: snapshot.type, title: snapshot.title, artist: snapshot.artist,
    album: snapshot.album, duration: snapshot.duration, format, updated_at: snapshot.updatedAt, is_video: false })
  const identity = parseCachedIdentity(entry, song)
  if (!identity) throw new Error('invalid_cache_response')
  return snapshotCachedSong(song, identity)
}
export function snapshotCachedSong(song: Song, identity: CacheIdentity): CachedSong {
  const key = JSON.parse(identity.key) as string[]
  return { ...parseSong({ id: song.id, type: song.type, title: song.title, artist: song.artist, album: song.album,
    duration: song.duration, format: key[6], updated_at: song.updatedAt, is_video: false }), deviceCache: identity }
}
export function cachedEntryQueue(entries: CachedEntry[], selected: CachedEntry): { playlist: CachedSong[]; index: number } {
  const chosen = new Map<number, CachedEntry>()
  for (const entry of entries) if (entry.namespace === selected.namespace && !chosen.has(entry.snapshot.id)) chosen.set(entry.snapshot.id, entry)
  // Multiple variants of one song share the native notification ID. Prefer the tapped variant.
  chosen.set(selected.snapshot.id, selected)
  const playlist = [...chosen.values()].map(cachedEntrySong)
  return { playlist, index: playlist.findIndex(song => song.id === selected.snapshot.id) }
}
