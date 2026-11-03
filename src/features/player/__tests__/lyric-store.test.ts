import { describe, test, expect, vi, beforeEach } from 'vitest'

// The store reads/writes the lyric cache through `getSongloftStorage`; swap it
// for a per-test in-memory map so cached-vs-fetched paths are observable.
const mockStorage = new Map<string, string>()
vi.mock('../../../core/storage/index.js', () => ({
  getSongloftStorage: () => ({
    prefs: {
      get: (key: string) => Promise.resolve(mockStorage.get(key) ?? null),
      set: (key: string, value: string) => {
        mockStorage.set(key, value)
        return Promise.resolve()
      },
      remove: (key: string) => {
        mockStorage.delete(key)
        return Promise.resolve()
      },
    },
    secure: { get: vi.fn(), set: vi.fn(), remove: vi.fn() },
  }),
}))

// `refetch` resolves the production fetcher at call time (no explicit fetcher
// is passed), so the default one is mocked here for the refetch tests.
// `vi.hoisted` because vi.mock factories run before any const initializes.
// The parameter list mirrors `LyricFetcher` (imported types are erased at
// compile time, so the hoisted callback may reference them).
const defaultFetcherMock = vi.hoisted(() =>
  vi.fn(async (
    _song: import('../../../models/song.js').Song,
    _opts?: { refresh?: boolean },
  ): Promise<{
    lyric?: string
    lxlyric?: string
    tlyric?: string
    rlyric?: string
  }> => ({})))
vi.mock('../data/lyric-source.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../data/lyric-source.js')>()
  return { ...actual, defaultLyricFetcher: defaultFetcherMock }
})

import type { Song } from '../../../models/song.js'
import type { LyricPayload } from '../../library/api/index.js'
import { useLyricStore } from '../store/lyric-store.js'
import { loadPlaybackState, savePlaybackState } from '../data/playback-persistence.js'
import { ApiError } from '../../../core/network/http-client.js'
import { cacheIdentity, cacheNamespace } from '../domain/cache-identity.js'
import { snapshotCachedSong } from '../domain/offline-cache.js'

function song(over: Partial<Song> = {}): Song {
  return {
    id: 7,
    type: 'local',
    title: 'Song',
    artist: 'Artist',
    album: undefined,
    year: 0,
    genre: undefined,
    language: undefined,
    style: undefined,
    duration: 200,
    filePath: '/music/a.mp3',
    url: '/stream/7',
    coverUrl: undefined,
    lyricUrl: '/api/v1/songs/7/lyric',
    lyricRemoteUrl: undefined,
    fileSize: 5000,
    format: 'mp3',
    bitRate: 320,
    sampleRate: 44100,
    sourceUrl: undefined,
    sourceCoverUrl: undefined,
    isLive: false,
    isVideo: false,
    addedAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...over,
  }
}

const PAYLOAD: LyricPayload = {
  lyric: '[00:01.000]first\n[00:02.500]second\n',
}

beforeEach(() => {
  mockStorage.clear()
  defaultFetcherMock.mockReset()
  useLyricStore.getState().clear()
})

describe('loadForSong', () => {
  test('keeps missing lyrics distinct from an unavailable server', async () => {
    await useLyricStore.getState().loadForSong(song({ lyricUrl: undefined }), async () => {
      throw new ApiError(404, 'not found')
    })
    expect(useLyricStore.getState().loadFailed).toBe(false)
    expect(useLyricStore.getState().lyrics).toHaveLength(0)
    await useLyricStore.getState().loadForSong(song({ lyricUrl: undefined }), async () => {
      throw new ApiError(502, 'upstream unavailable')
    })
    expect(useLyricStore.getState().loadFailed).toBe(true)
  })

  test('does not request server lyrics for offline snapshots, radio or invalid IDs', async () => {
    const original = song({ lyricUrl: undefined })
    const identity = cacheIdentity({
      namespace: cacheNamespace({ profile: 'one', server: 'http://server', username: 'alice' }),
      song: original,
      variant: { track: null, quality: 'original', normalize: false },
      format: 'mp3',
    })
    const fetcher = vi.fn(async () => PAYLOAD)
    for (const value of [snapshotCachedSong(original, identity),
      song({ type: 'radio', lyricUrl: undefined }),
      song({ type: 'remote', lyricUrl: undefined }),
      song({ id: 0, lyricUrl: undefined })]) {
      await useLyricStore.getState().loadForSong(value, fetcher)
      expect(useLyricStore.getState().lyrics).toHaveLength(0)
    }
    expect(fetcher).not.toHaveBeenCalled()
  })

  test('loads saved server lyrics after restoring a queue without a lyric URL', async () => {
    const original = song({ lyricUrl: undefined })
    await savePlaybackState({ playlist: [original], currentIndex: 0, positionMs: 1000 })
    const restored = (await loadPlaybackState())!.playlist[0]!
    const fetcher = vi.fn(async () => PAYLOAD)
    await useLyricStore.getState().loadForSong(restored, fetcher)
    expect(fetcher).toHaveBeenCalledWith(
      expect.objectContaining({ lyricUrl: '/api/v1/songs/7/lyric' }),
      { refresh: undefined },
    )
    expect(useLyricStore.getState().rawLyric).toBe(PAYLOAD.lyric)
    expect(restored.lyricUrl).toBeUndefined()
  })

  test('restores the re-fetched cache even when the saved queue has no lyric URL', async () => {
    const original = song({ lyricUrl: undefined })
    defaultFetcherMock.mockResolvedValue(PAYLOAD)
    await useLyricStore.getState().refetch(original)
    useLyricStore.getState().clear()
    const fetcher = vi.fn(async () => ({}))
    await useLyricStore.getState().loadForSong(original, fetcher)
    expect(fetcher).not.toHaveBeenCalled()
    expect(useLyricStore.getState().rawLyric).toBe(PAYLOAD.lyric)
  })

  test('keeps notification lyric placement across loading, missing lyrics and failures', async () => {
    useLyricStore.getState().setNotificationLyricInTitle(false)
    await useLyricStore.getState().loadForSong(song(), async () => PAYLOAD)
    expect(useLyricStore.getState().notificationLyricInTitle).toBe(false)
    await useLyricStore.getState().loadForSong(song({ lyricUrl: undefined }))
    expect(useLyricStore.getState().notificationLyricInTitle).toBe(false)
    await useLyricStore.getState().loadForSong(song({ id: 8 }), async () => {
      throw new Error('fetch failed')
    })
    expect(useLyricStore.getState().notificationLyricInTitle).toBe(false)
    useLyricStore.getState().clear()
    expect(useLyricStore.getState().notificationLyricInTitle).toBe(false)
  })

  test('parses the fetched payload into synced lines', async () => {
    const fetcher = vi.fn(async () => PAYLOAD)
    await useLyricStore.getState().loadForSong(song(), fetcher)

    const s = useLyricStore.getState()
    expect(s.lyrics).toHaveLength(2)
    expect(s.synced).toBe(true)
    expect(s.loadFailed).toBe(false)
    expect(s.rawLyric).toBe(PAYLOAD.lyric)
    expect(s.isLoading).toBe(false)
  })

  test('serves a cached payload without calling the fetcher', async () => {
    const fetcher = vi.fn(async () => PAYLOAD)
    await useLyricStore.getState().loadForSong(song(), fetcher)

    const fetcher2 = vi.fn(async () => ({ lyric: '[00:09.000]other\n' }))
    await useLyricStore.getState().loadForSong(song(), fetcher2)

    expect(fetcher2).not.toHaveBeenCalled()
    expect(useLyricStore.getState().rawLyric).toBe(PAYLOAD.lyric)
  })

  test('forceRefresh bypasses the cache and forwards refresh to the fetcher', async () => {
    const fetcher = vi.fn(async () => PAYLOAD)
    await useLyricStore.getState().loadForSong(song(), fetcher)

    const fresh: LyricPayload = { lyric: '[00:03.000]fresh\n' }
    const fetcher2 = vi.fn(async (
      _song: Song,
      _opts?: { refresh?: boolean },
    ) => fresh)
    await useLyricStore.getState().loadForSong(song(), fetcher2, { forceRefresh: true })

    expect(fetcher2).toHaveBeenCalledTimes(1)
    expect(fetcher2.mock.calls[0]![1]).toEqual({ refresh: true })
    expect(useLyricStore.getState().rawLyric).toBe(fresh.lyric)
  })

  test('invalidates cache when song.updatedAt changed (issue #477)', async () => {
    const fetcher = vi.fn(async () => PAYLOAD)
    await useLyricStore.getState().loadForSong(song(), fetcher)
    expect(fetcher).toHaveBeenCalledTimes(1)

    // Same songId, but the server has since updated the song (embedded USLT rewrite).
    // The cached copy must be invalidated and the fetcher called again.
    const fresh: LyricPayload = { lyric: '[00:05.000]updated\n' }
    const fetcher2 = vi.fn(async () => fresh)
    await useLyricStore.getState().loadForSong(
      song({ updatedAt: '2026-09-21T12:00:00Z' }),
      fetcher2,
    )

    expect(fetcher2).toHaveBeenCalledTimes(1)
    expect(useLyricStore.getState().rawLyric).toBe(fresh.lyric)

    // And the newly written cache entry carries the new songUpdatedAt, so the
    // next load with the same updatedAt is a hit.
    const stored = JSON.parse(mockStorage.get('lyric_7') ?? '{}')
    expect(stored.songUpdatedAt).toBe('2026-09-21T12:00:00Z')
  })

  test('sets loadFailed when the fetch throws', async () => {
    const fetcher = vi.fn(async () => {
      throw new Error('network down')
    })
    await useLyricStore.getState().loadForSong(song(), fetcher)

    expect(useLyricStore.getState().loadFailed).toBe(true)
    expect(useLyricStore.getState().lyrics).toHaveLength(0)
  })

  test('clears state for a song without a lyric URL', async () => {
    await useLyricStore.getState().loadForSong(song({ lyricUrl: undefined }))
    expect(useLyricStore.getState().lyrics).toHaveLength(0)
  })
})

describe('refetch', () => {
  test('evicts the cache and reloads from the backend with refresh set', async () => {
    const fetcher = vi.fn(async () => PAYLOAD)
    await useLyricStore.getState().loadForSong(song(), fetcher)
    expect(mockStorage.has('lyric_7')).toBe(true)

    const fresh: LyricPayload = { lyric: '[00:04.000]re-fetched\n' }
    defaultFetcherMock.mockImplementation(async () => fresh)

    await useLyricStore.getState().refetch(song())

    // Old payload gone, fresh payload applied.
    expect(useLyricStore.getState().rawLyric).toBe(fresh.lyric)
    // The refresh flag reached the (default) fetcher.
    expect(defaultFetcherMock.mock.calls[0]![1]).toEqual({ refresh: true })
  })

  test('assembles the lyric endpoint for a local song without lyricUrl', async () => {
    const local = song({ lyricUrl: undefined })
    defaultFetcherMock.mockImplementation(async (_s, opts) => {
      expect(opts?.refresh).toBe(true)
      return PAYLOAD
    })

    await useLyricStore.getState().refetch(local)

    expect(defaultFetcherMock.mock.calls[0]![0]).toMatchObject({
      lyricUrl: '/api/v1/songs/7/lyric',
    })
    expect(useLyricStore.getState().rawLyric).toBe(PAYLOAD.lyric)
  })

  test('does nothing for a remote song without lyricUrl', async () => {
    await useLyricStore.getState().refetch(song({ type: 'remote', lyricUrl: undefined }))
    expect(useLyricStore.getState().lyrics).toHaveLength(0)
  })

  test('does nothing without a song', async () => {
    await expect(useLyricStore.getState().refetch(undefined)).resolves.toBeUndefined()
  })
})

describe('syncPosition', () => {
  test('tracks the current line by position (no offset state anymore)', async () => {
    await useLyricStore.getState().loadForSong(
      song(),
      vi.fn(async () => PAYLOAD),
    )

    useLyricStore.getState().syncPosition(1_200)
    expect(useLyricStore.getState().currentIndex).toBe(0)

    useLyricStore.getState().syncPosition(2_600)
    expect(useLyricStore.getState().currentIndex).toBe(1)
  })
})
