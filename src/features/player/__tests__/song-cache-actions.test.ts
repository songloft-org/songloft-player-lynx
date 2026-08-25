import { beforeEach, describe, expect, test, vi } from 'vitest'

import type { Song } from '../../../models/song.js'
import { cacheSongToDevice, removeSongCache } from '../domain/song-cache-actions.js'

/**
 * The cache flow's decision logic, isolated from the native module and the store:
 * the facade, the cap pref, and the URL/ext resolvers are all mocked so each test
 * pins one branch.
 */

const mocks = vi.hoisted(() => ({
  downloadSong: vi.fn(),
  getSongCacheSize: vi.fn(),
  removeCachedSong: vi.fn(),
  readLocalCacheMaxSize: vi.fn(),
  songUrl: vi.fn(),
  songCacheExtOf: vi.fn(),
}))

vi.mock('../data/song-cache.js', () => ({
  downloadSong: mocks.downloadSong,
  getSongCacheSize: mocks.getSongCacheSize,
  removeCachedSong: mocks.removeCachedSong,
  SONG_CACHE_LIMIT_ERROR: 'limit_exceeded',
}))
vi.mock('../data/song-cache-prefs.js', () => ({
  readLocalCacheMaxSize: mocks.readLocalCacheMaxSize,
}))
vi.mock('../store/player-store.js', () => ({
  songUrl: mocks.songUrl,
  songCacheExtOf: mocks.songCacheExtOf,
}))

const song = { id: 7, title: 'T', isVideo: false } as Song

beforeEach(() => {
  vi.clearAllMocks()
  mocks.readLocalCacheMaxSize.mockResolvedValue(1000)
  mocks.getSongCacheSize.mockResolvedValue(0)
  mocks.songUrl.mockReturnValue('http://x/play')
  mocks.songCacheExtOf.mockReturnValue('mp3')
  mocks.downloadSong.mockResolvedValue(undefined)
  mocks.removeCachedSong.mockResolvedValue(undefined)
})

describe('cacheSongToDevice', () => {
  test('downloads with the resolved URL, extension and cap', async () => {
    await expect(cacheSongToDevice(song)).resolves.toBe('cached')
    expect(mocks.downloadSong).toHaveBeenCalledWith(7, 'http://x/play', 'mp3', 1000)
  })

  test('rejects up front when the cache is already at the cap (no native call)', async () => {
    mocks.getSongCacheSize.mockResolvedValue(1000) // == cap
    await expect(cacheSongToDevice(song)).resolves.toBe('limit')
    expect(mocks.downloadSong).not.toHaveBeenCalled()
  })

  test('maps the native limit sentinel to limit', async () => {
    mocks.downloadSong.mockRejectedValue(new Error('limit_exceeded'))
    await expect(cacheSongToDevice(song)).resolves.toBe('limit')
  })

  test('maps any other failure to failed', async () => {
    mocks.downloadSong.mockRejectedValue(new Error('HTTP 500'))
    await expect(cacheSongToDevice(song)).resolves.toBe('failed')
  })
})

describe('removeSongCache', () => {
  test('removes and reports removed', async () => {
    await expect(removeSongCache(song)).resolves.toBe('removed')
    expect(mocks.removeCachedSong).toHaveBeenCalledWith(7)
  })

  test('reports failed when removal throws', async () => {
    mocks.removeCachedSong.mockRejectedValue(new Error('boom'))
    await expect(removeSongCache(song)).resolves.toBe('failed')
  })
})
