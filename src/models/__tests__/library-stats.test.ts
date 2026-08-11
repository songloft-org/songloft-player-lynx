import { describe, expect, test } from 'vitest'

import { EMPTY_LIBRARY_STATS, parseLibraryStats } from '../library-stats.js'

describe('parseLibraryStats', () => {
  /**
   * Captured from a live backend, which is also where the units came from —
   * swagger only says `integer`/`number`. 60 songs / 9643s works out to ~160s
   * each, confirming seconds; `total_file_size` is 0 because every song is remote.
   */
  test('maps the live-backend response field for field', () => {
    expect(parseLibraryStats({
      total_songs: 60,
      local_songs: 0,
      remote_songs: 60,
      radio_songs: 0,
      total_duration: 9643,
      total_file_size: 0,
      artist_count: 27,
      album_count: 58,
      genre_count: 0,
    })).toEqual({
      totalSongs: 60,
      localSongs: 0,
      remoteSongs: 60,
      radioSongs: 0,
      totalDuration: 9643,
      totalFileSize: 0,
      artistCount: 27,
      albumCount: 58,
      genreCount: 0,
    })
  })

  test('an empty payload yields all zeroes (swagger marks nothing required)', () => {
    expect(parseLibraryStats({})).toEqual(EMPTY_LIBRARY_STATS)
    expect(EMPTY_LIBRARY_STATS.totalSongs).toBe(0)
  })

  /** AGENTS §2: the backend sends `null`, and `.default()` would not cover it. */
  test('a null-heavy payload falls back per field instead of throwing', () => {
    const s = parseLibraryStats({
      total_songs: null,
      local_songs: null,
      remote_songs: null,
      radio_songs: null,
      total_duration: null,
      total_file_size: null,
      artist_count: null,
      album_count: null,
      genre_count: null,
    })
    expect(s).toEqual(EMPTY_LIBRARY_STATS)
  })

  test('stringified numbers are coerced, and junk falls back', () => {
    expect(parseLibraryStats({ total_songs: '60' }).totalSongs).toBe(60)
    expect(parseLibraryStats({ total_duration: '9643.5' }).totalDuration).toBe(9643.5)
    expect(parseLibraryStats({ total_songs: 'lots' }).totalSongs).toBe(0)
  })

  test('a non-object payload does not throw', () => {
    expect(parseLibraryStats(null)).toEqual(EMPTY_LIBRARY_STATS)
    expect(parseLibraryStats('nope')).toEqual(EMPTY_LIBRARY_STATS)
  })
})
