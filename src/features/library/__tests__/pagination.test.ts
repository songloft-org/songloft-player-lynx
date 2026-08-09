import { describe, expect, test } from 'vitest'

import type { Song, SongFacetResponse, SongListResponse } from '../../../models/song.js'
import { formatDuration } from '../data/format.js'
import {
  facetsLoadedCount,
  facetsNextPageParam,
  flattenFacets,
  flattenSongs,
  hasMore,
  nextOffset,
  songsLoadedCount,
  songsNextPageParam,
} from '../data/pagination.js'

/** A fully-populated `Song` (all keys present; optional fields `undefined`). */
function song(id: number): Song {
  return {
    id,
    type: 'local',
    title: `S${id}`,
    artist: undefined,
    album: undefined,
    year: 0,
    genre: undefined,
    language: undefined,
    style: undefined,
    duration: 0,
    filePath: undefined,
    url: undefined,
    coverUrl: undefined,
    lyricUrl: undefined,
    lyricRemoteUrl: undefined,
    fileSize: 0,
    format: undefined,
    bitRate: 0,
    sampleRate: 0,
    sourceUrl: undefined,
    sourceCoverUrl: undefined,
    isLive: false,
    isVideo: false,
    addedAt: '',
    updatedAt: '',
  }
}

/** Build a fake songs page of `n` items (ids offset by `start`) with a `total`. */
function songPage(n: number, total: number, start = 0): SongListResponse {
  return {
    songs: Array.from({ length: n }, (_, i) => song(start + i)),
    total,
  }
}

function facetPage(n: number, total: number, start = 0): SongFacetResponse {
  return {
    facets: Array.from({ length: n }, (_, i) => ({
      value: `F${start + i}`,
      count: 1,
      coverUrl: '',
    })),
    total,
  }
}

describe('nextOffset / hasMore (generic)', () => {
  test('advances to the accumulated count while below total', () => {
    expect(nextOffset(20, 50)).toBe(20)
    expect(hasMore(20, 50)).toBe(true)
  })

  test('stops (undefined) once accumulated reaches or exceeds total', () => {
    expect(nextOffset(50, 50)).toBeUndefined()
    expect(nextOffset(60, 50)).toBeUndefined()
    expect(hasMore(50, 50)).toBe(false)
  })
})

describe('songsNextPageParam', () => {
  test('after one full page of 20/total 50 → next offset 20', () => {
    const pages = [songPage(20, 50, 0)]
    expect(songsLoadedCount(pages)).toBe(20)
    expect(songsNextPageParam(pages[0]!, pages)).toBe(20)
  })

  test('accumulates across pages and advances', () => {
    const pages = [songPage(20, 50, 0), songPage(20, 50, 20)]
    expect(songsLoadedCount(pages)).toBe(40)
    expect(songsNextPageParam(pages[1]!, pages)).toBe(40)
  })

  test('stops at the end (40 + 10 = 50 of 50)', () => {
    const pages = [songPage(20, 50, 0), songPage(20, 50, 20), songPage(10, 50, 40)]
    expect(songsLoadedCount(pages)).toBe(50)
    expect(songsNextPageParam(pages[2]!, pages)).toBeUndefined()
  })

  test('empty first page (total 0) → no next page', () => {
    const pages = [songPage(0, 0)]
    expect(songsNextPageParam(pages[0]!, pages)).toBeUndefined()
  })
})

describe('facetsNextPageParam', () => {
  test('advances then stops', () => {
    const one = [facetPage(20, 30, 0)]
    expect(facetsLoadedCount(one)).toBe(20)
    expect(facetsNextPageParam(one[0]!, one)).toBe(20)
    const two = [facetPage(20, 30, 0), facetPage(10, 30, 20)]
    expect(facetsNextPageParam(two[1]!, two)).toBeUndefined()
  })
})

describe('flatten', () => {
  test('flattenSongs concatenates page songs in order', () => {
    const pages = [songPage(2, 4, 0), songPage(2, 4, 2)]
    expect(flattenSongs(pages).map((s) => s.id)).toEqual([0, 1, 2, 3])
  })

  test('flattenSongs handles undefined (no data yet)', () => {
    expect(flattenSongs(undefined)).toEqual([])
  })

  test('flattenFacets concatenates page facets in order', () => {
    const pages = [facetPage(2, 3, 0), facetPage(1, 3, 2)]
    expect(flattenFacets(pages).map((f) => f.value)).toEqual(['F0', 'F1', 'F2'])
  })
})

describe('formatDuration', () => {
  test('mm:ss under an hour', () => {
    expect(formatDuration(0)).toBe('00:00')
    expect(formatDuration(5)).toBe('00:05')
    expect(formatDuration(65)).toBe('01:05')
    expect(formatDuration(599)).toBe('09:59')
  })

  test('hh:mm:ss past an hour', () => {
    expect(formatDuration(3661)).toBe('01:01:01')
  })

  test('rounds and clamps invalid input', () => {
    expect(formatDuration(59.6)).toBe('01:00')
    expect(formatDuration(-10)).toBe('00:00')
    expect(formatDuration(Number.NaN)).toBe('00:00')
  })
})
