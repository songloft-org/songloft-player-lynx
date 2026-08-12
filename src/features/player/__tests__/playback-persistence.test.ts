import { describe, test, expect, vi, beforeEach } from 'vitest'

const mockStorage = new Map<string, string>()
vi.mock('../../../core/storage/index.js', () => ({
  getSongloftStorage: () => ({
    prefs: {
      get: vi.fn((key: string) => Promise.resolve(mockStorage.get(key) ?? null)),
      set: vi.fn((key: string, value: string) => { mockStorage.set(key, value); return Promise.resolve() }),
      remove: vi.fn((key: string) => { mockStorage.delete(key); return Promise.resolve() }),
    },
    secure: { get: vi.fn(), set: vi.fn(), remove: vi.fn() },
  }),
}))

import { loadPlaybackState, savePlaybackState } from '../data/playback-persistence.js'

const SONG_JSON = {
  id: 1,
  type: 'local',
  title: 'Test Song',
  artist: 'Artist',
  album: null,
  year: 0,
  genre: null,
  language: null,
  style: null,
  duration: 200,
  file_path: '/music/test.mp3',
  url: '/stream/1',
  cover_url: null,
  lyric_url: null,
  lyric_remote_url: null,
  file_size: 5000,
  format: 'mp3',
  bit_rate: 320,
  sample_rate: 44100,
  source_url: null,
  source_cover_url: null,
  is_live: false,
  is_video: false,
  added_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

describe('playback-persistence', () => {
  beforeEach(() => { mockStorage.clear() })

  test('returns null when no saved state', async () => {
    expect(await loadPlaybackState()).toBeNull()
  })

  test('round-trips save and load', async () => {
    const song = { ...SONG_JSON }
    await savePlaybackState(
      [{ id: 1, type: 'local' as const, title: 'Test Song', artist: 'Artist', album: undefined, year: 0, genre: undefined, language: undefined, style: undefined, duration: 200, filePath: '/music/test.mp3', url: '/stream/1', coverUrl: undefined, lyricUrl: undefined, lyricRemoteUrl: undefined, fileSize: 5000, format: 'mp3', bitRate: 320, sampleRate: 44100, sourceUrl: undefined, sourceCoverUrl: undefined, isLive: false, isVideo: false, addedAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' }],
      0,
      15000,
      42,
    )

    const restored = await loadPlaybackState()
    expect(restored).not.toBeNull()
    expect(restored!.playlist).toHaveLength(1)
    expect(restored!.playlist[0].title).toBe('Test Song')
    expect(restored!.currentIndex).toBe(0)
    expect(restored!.positionMs).toBe(15000)
    expect(restored!.sourcePlaylistId).toBe(42)
  })

  test('clears state when saving empty playlist', async () => {
    mockStorage.set('playback_queue', JSON.stringify([SONG_JSON]))
    mockStorage.set('playback_index', '0')

    await savePlaybackState([], 0, 0)

    expect(await loadPlaybackState()).toBeNull()
  })

  test('clamps index to valid range', async () => {
    mockStorage.set('playback_queue', JSON.stringify([SONG_JSON, SONG_JSON]))
    mockStorage.set('playback_index', '99')
    mockStorage.set('playback_position', '5000')

    const restored = await loadPlaybackState()
    expect(restored!.currentIndex).toBe(1)
  })
})
