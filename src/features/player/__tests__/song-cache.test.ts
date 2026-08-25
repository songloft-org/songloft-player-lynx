import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import {
  clearSongCache,
  downloadSong,
  getCacheInfo,
  getCachedPath,
  getSongCacheSize,
  removeCachedSong,
  SONG_CACHE_LIMIT_ERROR,
} from '../data/song-cache.js'

/**
 * The facade over the `SongloftSongCache` native module. The module is injected
 * through `globalThis.NativeModules` (the test fallback `readNativeModules` uses),
 * and each method answers through its JSON-string callback — so these tests drive
 * the real promise-wrapping and error/normalization logic without a device.
 */

const g = globalThis as Record<string, unknown>

/** Build a fake module whose replies each test configures. */
function installModule(overrides: Record<string, (...args: unknown[]) => void> = {}) {
  const mod: Record<string, unknown> = {
    download: vi.fn(),
    getCacheInfo: vi.fn(),
    remove: vi.fn(),
    getCacheSize: vi.fn(),
    clearAll: vi.fn(),
    ...overrides,
  }
  g.NativeModules = { SongloftSongCache: mod }
  return mod
}

afterEach(() => {
  delete g.NativeModules
})

describe('when the module is absent (Web / unit realm)', () => {
  test('everything degrades instead of throwing', async () => {
    delete g.NativeModules
    expect(await getCachedPath(1)).toBeNull()
    expect((await getCacheInfo(1)).cached).toBe(false)
    expect(await getSongCacheSize()).toBe(0)
    await expect(removeCachedSong(1)).resolves.toBeUndefined()
    await expect(clearSongCache()).resolves.toBeUndefined()
    await expect(downloadSong(1, 'u', 'mp3', 10)).rejects.toThrow()
  })

  test('a stale module without getCacheInfo is treated as absent', async () => {
    // Only the old 3-arg `download` — the facade must not light up for it.
    g.NativeModules = { SongloftSongCache: { download: vi.fn() } }
    expect(await getCachedPath(1)).toBeNull()
    await expect(downloadSong(1, 'u', 'mp3', 10)).rejects.toThrow()
  })
})

describe('downloadSong', () => {
  test('passes id/url/ext/maxBytes through and resolves on success', async () => {
    const download = vi.fn((_id, _url, _ext, _max, cb) =>
      cb(JSON.stringify({ path: 'file:///data/song_cache/1.mp3' })),
    )
    const mod = installModule({ download })

    await expect(downloadSong(1, 'http://x/play', 'mp3', 1024)).resolves.toBeUndefined()
    expect(download).toHaveBeenCalledWith(
      '1',
      'http://x/play',
      'mp3',
      1024,
      expect.any(Function),
    )
    void mod
  })

  test('rejects with the limit sentinel when the cap is hit', async () => {
    installModule({
      download: vi.fn((_id, _url, _ext, _max, cb) =>
        cb(JSON.stringify({ error: SONG_CACHE_LIMIT_ERROR })),
      ),
    })
    await expect(downloadSong(1, 'u', 'mp3', 10)).rejects.toThrow(SONG_CACHE_LIMIT_ERROR)
  })

  test('rejects with the reported error otherwise', async () => {
    installModule({
      download: vi.fn((_id, _url, _ext, _max, cb) => cb(JSON.stringify({ error: 'HTTP 500' }))),
    })
    await expect(downloadSong(1, 'u', 'mp3', 10)).rejects.toThrow('HTTP 500')
  })
})

describe('getCacheInfo / getCachedPath', () => {
  test('reports a cached song with a playable file:// URL', async () => {
    installModule({
      getCacheInfo: vi.fn((_id, cb) =>
        cb(JSON.stringify({ cached: true, url: 'file:///data/song_cache/1.mp3', sizeBytes: 42 })),
      ),
    })
    const info = await getCacheInfo(1)
    expect(info.cached).toBe(true)
    expect(info.url).toBe('file:///data/song_cache/1.mp3')
    expect(info.sizeBytes).toBe(42)
    expect(await getCachedPath(1)).toBe('file:///data/song_cache/1.mp3')
  })

  test('normalizes a bare absolute path to a file:// URL', async () => {
    // A hot-updated bundle on an older shell could still get a raw path back; the
    // audio engine needs a real URL.
    installModule({
      getCacheInfo: vi.fn((_id, cb) =>
        cb(JSON.stringify({ cached: true, url: '/data/song_cache/1.mp3', sizeBytes: 1 })),
      ),
    })
    expect(await getCachedPath(1)).toBe('file:///data/song_cache/1.mp3')
  })

  test('reports an uncached song as such', async () => {
    installModule({
      getCacheInfo: vi.fn((_id, cb) =>
        cb(JSON.stringify({ cached: false, url: null, sizeBytes: 0 })),
      ),
    })
    expect((await getCacheInfo(1)).cached).toBe(false)
    expect(await getCachedPath(1)).toBeNull()
  })
})

describe('getSongCacheSize / remove / clearAll', () => {
  test('reads the byte total', async () => {
    installModule({ getCacheSize: vi.fn((cb) => cb(JSON.stringify({ bytes: 12345 }))) })
    expect(await getSongCacheSize()).toBe(12345)
  })

  test('remove targets the song id', async () => {
    const remove = vi.fn((_id, cb) => cb('{}'))
    installModule({ remove })
    await removeCachedSong(7)
    expect(remove).toHaveBeenCalledWith('7', expect.any(Function))
  })

  test('clearAll resolves through the callback', async () => {
    const clearAll = vi.fn((cb) => cb('{}'))
    installModule({ clearAll })
    await expect(clearSongCache()).resolves.toBeUndefined()
    expect(clearAll).toHaveBeenCalled()
  })
})
