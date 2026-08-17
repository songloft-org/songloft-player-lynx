import { describe, expect, test } from 'vitest'

import {
  facetContext,
  isPlaybackFacetType,
  PLAYBACK_FACET_TYPES,
  playlistContext,
  playlistIdOf,
  samePlaybackContext,
} from '../domain/playback-context.js'

describe('playlistContext', () => {
  test('builds a context from a usable ID', () => {
    expect(playlistContext(3)).toEqual({ type: 'playlist', key: '3' })
  })

  test('rejects IDs that are not real playlists', () => {
    // 0 is what PlaylistDetailPage derives from a missing route param, and it
    // passes a `!= null` check — the whole reason this guard exists.
    expect(playlistContext(0)).toBeUndefined()
    expect(playlistContext(-1)).toBeUndefined()
    expect(playlistContext(Number.NaN)).toBeUndefined()
  })
})

describe('facetContext', () => {
  test('accepts every facet dimension the backend supports', () => {
    for (const field of PLAYBACK_FACET_TYPES) {
      expect(facetContext(field, 'x')).toEqual({ type: field, key: 'x' })
    }
  })

  test('keeps the raw value, including characters that need URL encoding', () => {
    expect(facetContext('artist', '周杰伦')).toEqual({ type: 'artist', key: '周杰伦' })
    expect(facetContext('album', 'a/b & c')).toEqual({ type: 'album', key: 'a/b & c' })
  })

  test('rejects source fields — they are not history dimensions', () => {
    expect(facetContext('favorites', 'x')).toBeUndefined()
    expect(facetContext('random', 'x')).toBeUndefined()
    expect(facetContext('local', 'x')).toBeUndefined()
    expect(facetContext('folder', '/music')).toBeUndefined()
  })

  test('rejects an empty value — the "unknown artist" bucket would 400', () => {
    expect(facetContext('artist', '')).toBeUndefined()
    expect(facetContext('artist', '   ')).toBeUndefined()
  })
})

describe('playlistIdOf', () => {
  test('reads the ID back out of a playlist context', () => {
    expect(playlistIdOf({ type: 'playlist', key: '7' })).toBe(7)
  })

  test('returns undefined for facet contexts, never NaN', () => {
    // NaN would reach JS plugins as `source_playlist_id`.
    const id = playlistIdOf({ type: 'artist', key: '周杰伦' })
    expect(id).toBeUndefined()
    expect(Number.isNaN(id)).toBe(false)
  })

  test('returns undefined for no context', () => {
    expect(playlistIdOf(undefined)).toBeUndefined()
  })
})

describe('samePlaybackContext', () => {
  test('compares by type and key', () => {
    const a = { type: 'artist' as const, key: 'X' }
    expect(samePlaybackContext(a, { type: 'artist', key: 'X' })).toBe(true)
    expect(samePlaybackContext(a, { type: 'artist', key: 'Y' })).toBe(false)
    expect(samePlaybackContext(a, { type: 'album', key: 'X' })).toBe(false)
  })

  test('two absent contexts are the same, one absent is not', () => {
    expect(samePlaybackContext(undefined, undefined)).toBe(true)
    expect(samePlaybackContext({ type: 'playlist', key: '1' }, undefined)).toBe(false)
  })
})

describe('isPlaybackFacetType', () => {
  test('separates facet dimensions from everything else', () => {
    expect(isPlaybackFacetType('genre')).toBe(true)
    expect(isPlaybackFacetType('playlist')).toBe(false)
    expect(isPlaybackFacetType('recent')).toBe(false)
  })
})
