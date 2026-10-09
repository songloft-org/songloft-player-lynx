import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { parseSong } from '../../../models/song.js'
import { appConfig } from '../../../core/config/app-config.js'
import { getAudio } from '../../../native/index.js'
import { cacheIdentity, cacheNamespace, cacheSnapshot } from '../domain/cache-identity.js'
import { cachedEntrySong } from '../domain/offline-cache.js'
import type { CachedEntry } from '../data/indexed-song-cache.js'
import { offlineIdentity } from '../data/offline-identity.js'
import { forgetCachedPlayback, resetLoadedSongForTests, usePlayerStore } from '../store/player-store.js'

const host = vi.hoisted(() => ({ entries: new Map<string, CachedEntry>(), read: vi.fn(), network: vi.fn() }))
vi.mock('../data/indexed-song-cache.js', () => ({ indexedSongCacheAvailable: () => false,
  readIndexedSong: async (identity: { key: string }) => { host.read(identity); return host.entries.get(identity.key) ?? null } }))
vi.mock('../../library/api/index.js', () => ({ getSongsApi: host.network }))
vi.mock('../../library/data/favorites.js', () => ({ getFavoriteState: host.network, toggleFavoriteNonReact: host.network }))
const address = { profile: 'cached-profile', server: 'http://offline-server' }
const namespace = cacheNamespace({ ...address, username: 'alice' })
function cached(id: number, duration = 60) {
  const song = parseSong({ id, title: `Offline ${id}`, updated_at: 'revision', duration })
  const entry: CachedEntry = { ...cacheIdentity({ namespace, song, variant: { track: 1, quality: '192', normalize: true }, format: 'm4a' }),
    cached: true, url: `file:///private/${id}.m4a`, sizeBytes: 4096, createdAt: 1, snapshot: cacheSnapshot(song) }
  host.entries.set(entry.key, entry)
  return cachedEntrySong(entry)
}
beforeEach(async () => {
  vi.useFakeTimers(); vi.clearAllMocks(); host.entries.clear()
  appConfig.reset(); appConfig.baseUrl = address.server; appConfig.resolvedBaseUrl = address.server
  usePlayerStore.getState().reset(); resetLoadedSongForTests()
  await offlineIdentity.activate(address, 'alice')
})
afterEach(() => { usePlayerStore.getState().reset(); offlineIdentity.clearMemory(); appConfig.reset(); vi.restoreAllMocks(); vi.useRealTimers() })
test('local playback, transport and notification windows read files without song/favorite/history requests', async () => {
  const songs = [cached(7), cached(8)]
  const load = vi.spyOn(getAudio(), 'load')
  await usePlayerStore.getState().playPlaylist(songs, 0)
  expect(load.mock.calls[0][0]).toBe('file:///private/7.m4a')
  await usePlayerStore.getState().togglePlay(); await usePlayerStore.getState().togglePlay()
  await usePlayerStore.getState().seek(5000)
  await usePlayerStore.getState().playNext()
  expect(load.mock.calls.at(-1)?.[0]).toBe('file:///private/8.m4a')
  await usePlayerStore.getState().playPrev()
  expect(load.mock.calls.at(-1)?.[0]).toBe('file:///private/7.m4a')
  expect(host.network).not.toHaveBeenCalled()
})
test('missing files fail locally and never start a remote request or retry loop', async () => {
  const song = cached(7); host.entries.clear()
  await expect(usePlayerStore.getState().playPlaylist([song])).rejects.toThrow('cache_file_unavailable')
  expect(usePlayerStore.getState()).toMatchObject({ isPlaying: false, isBuffering: false, errorMessage: 'cache_file_unavailable' })
  const reads = host.read.mock.calls.length
  await vi.advanceTimersByTimeAsync(30000)
  expect(host.read).toHaveBeenCalledTimes(reads)
  expect(host.network).not.toHaveBeenCalled()
})
test('a SAF cache passes its content URI to audio without any remote detail or favorite requests', async () => {
  const song = cached(7)
  const uri = 'content://com.android.externalstorage.documents/tree/primary%3AMusic/document/primary%3AMusic%2Foffline.m4a'
  host.entries.get(song.deviceCache.key)!.url = uri
  const load = vi.spyOn(getAudio(), 'load')
  await usePlayerStore.getState().playPlaylist([song])
  expect(load.mock.calls[0][0]).toBe(uri)
  expect(host.network).not.toHaveBeenCalled()
})
test('another authenticated actor cannot play the same song ID from the previous actor’s queue', async () => {
  const song = cached(7)
  await offlineIdentity.activate(address, 'bob')
  await expect(usePlayerStore.getState().playPlaylist([song])).rejects.toThrow('cache_identity_unavailable')
  expect(host.read).not.toHaveBeenCalled()
  expect(host.network).not.toHaveBeenCalled()
})
test('deleting the current cached variant stops audio and empties its saved queue', async () => {
  const songs = [cached(7), cached(8)]
  await usePlayerStore.getState().playPlaylist(songs)
  const stop = vi.spyOn(getAudio(), 'stop')
  await forgetCachedPlayback(songs[0].deviceCache)
  expect(stop).toHaveBeenCalled()
  expect(usePlayerStore.getState()).toMatchObject({ currentSong: undefined, playlist: [], isPlaying: false })
})
test('deleting a queued file preserves the current song and compacts its index', async () => {
  const songs = [cached(7), cached(8), cached(9)]
  await usePlayerStore.getState().playPlaylist(songs, 1)
  await forgetCachedPlayback(songs[0].deviceCache)
  expect(usePlayerStore.getState().playlist.map(song => song.id)).toEqual([8, 9])
  expect(usePlayerStore.getState().currentIndex).toBe(0)
  expect(usePlayerStore.getState().currentSong?.id).toBe(8)
  await forgetCachedPlayback({ namespace: 'other-user' })
  expect(usePlayerStore.getState().playlist).toHaveLength(2)
})
test('playing a completed cached queue reloads from the beginning instead of resuming an ended engine', async () => {
  const load = vi.spyOn(getAudio(), 'load')
  await usePlayerStore.getState().playPlaylist([cached(7, 1)])
  await vi.advanceTimersByTimeAsync(1500)
  expect(usePlayerStore.getState()).toMatchObject({ isPlaying: false, currentSong: { id: 7 } })
  await usePlayerStore.getState().togglePlay()
  expect(load).toHaveBeenCalledTimes(2)
  expect(usePlayerStore.getState()).toMatchObject({ isPlaying: true, currentTime: 0 })
  expect(host.network).not.toHaveBeenCalled()
})
