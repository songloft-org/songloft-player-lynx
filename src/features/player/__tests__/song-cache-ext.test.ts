import { afterEach, describe, expect, test, vi } from 'vitest'

import type { Song } from '../../../models/song.js'
import { setAudioQualityCache, songCacheExtOf, songUrl } from '../store/player-store.js'

/**
 * `songCacheExtOf` must name the container the cache will actually receive — i.e.
 * the one `songUrl` asks the server for. If the two disagree, the cached file's
 * extension lies and the player picks the wrong decoder. These tests pin them to
 * the same decision.
 *
 * Platform defaults to `'web'` here (no `SystemInfo`), the most restrictive set.
 */

// Keep the store's module-level pref reads off real storage.
vi.mock('../../settings/data/settings-prefs.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  readAudioQuality: () => Promise.resolve('original'),
  readNormalize: () => Promise.resolve(false),
  readAutoResume: () => Promise.resolve(false),
  readPlaybackSpeed: () => Promise.resolve(1),
}))

const g = globalThis as Record<string, unknown>

afterEach(() => {
  delete g.SystemInfo
  setAudioQualityCache(null)
})

function song(format: string | undefined): Song {
  return {
    id: 1,
    type: 'remote',
    title: 'T',
    year: 0,
    duration: 0,
    fileSize: 0,
    bitRate: 0,
    sampleRate: 0,
    isLive: false,
    isVideo: false,
    addedAt: '',
    updatedAt: '',
    url: '/api/v1/songs/1/play',
    format,
  } as Song
}

/** The `format=` query value `songUrl` produced, or null when it sent none. */
function formatParam(url: string): string | null {
  const m = url.match(/[?&]format=([^&]+)/)
  return m ? m[1] : null
}

describe('songCacheExtOf agrees with songUrl (web target)', () => {
  test('a transcoded container matches the ?format= param', () => {
    // mkv cannot play in a browser <audio>, so the server transcodes to mp3.
    const s = song('mkv')
    expect(formatParam(songUrl(s))).toBe('mp3')
    expect(songCacheExtOf(s)).toBe('mp3')
  })

  test('a natively-playable container keeps its own extension', () => {
    for (const fmt of ['mp3', 'flac', 'ogg']) {
      const s = song(fmt)
      expect(formatParam(songUrl(s))).toBeNull() // no transcode requested
      expect(songCacheExtOf(s)).toBe(fmt)
    }
  })

  test('a normalized id3/alias resolves to its canonical container', () => {
    const s = song('mpeg') // alias for mp3
    expect(songCacheExtOf(s)).toBe('mp3')
  })

  test('setting a quality forces mp3 even when no transcode was needed', () => {
    // quality= without format= is documented to make the backend transcode to mp3,
    // so the cached bytes will be mp3 even for a natively-playable source.
    setAudioQualityCache('320')
    const s = song('flac')
    expect(formatParam(songUrl(s))).toBeNull()
    expect(songUrl(s)).toContain('quality=320')
    expect(songCacheExtOf(s)).toBe('mp3')
  })
})
