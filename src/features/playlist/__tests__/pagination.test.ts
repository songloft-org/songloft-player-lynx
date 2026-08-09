import { describe, expect, test } from 'vitest'

import type { Playlist, PlaylistListResponse } from '../../../models/playlist.js'
import {
  flattenPlaylists,
  playlistsLoadedCount,
  playlistsNextPageParam,
} from '../data/pagination.js'

/** A minimal `Playlist` (all required keys present). */
function playlist(id: number): Playlist {
  return {
    id,
    type: 'normal',
    name: `P${id}`,
    description: undefined,
    coverUrl: undefined,
    labels: [],
    songCount: 0,
    createdAt: '',
    updatedAt: '',
    isBuiltIn: false,
    isAutoCreated: false,
    isHidden: false,
  }
}

/** Build a fake playlists page of `n` items (ids offset by `start`) with a `total`. */
function page(n: number, total: number, start = 0): PlaylistListResponse {
  return {
    playlists: Array.from({ length: n }, (_, i) => playlist(start + i)),
    total,
  }
}

describe('playlistsLoadedCount', () => {
  test('sums playlist counts across pages', () => {
    expect(playlistsLoadedCount([page(20, 42), page(20, 42, 20)])).toBe(40)
  })

  test('is zero for no pages', () => {
    expect(playlistsLoadedCount([])).toBe(0)
  })
})

describe('playlistsNextPageParam', () => {
  test('advances to the accumulated count while below total', () => {
    const pages = [page(20, 42)]
    expect(playlistsNextPageParam(pages[0]!, pages)).toBe(20)
  })

  test('advances again on the next page', () => {
    const pages = [page(20, 42), page(20, 42, 20)]
    expect(playlistsNextPageParam(pages[1]!, pages)).toBe(40)
  })

  test('returns undefined once the accumulated count reaches total (stop)', () => {
    const pages = [page(20, 42), page(20, 42, 20), page(2, 42, 40)]
    expect(playlistsNextPageParam(pages[2]!, pages)).toBeUndefined()
  })

  test('returns undefined for an empty final page', () => {
    const pages = [page(0, 0)]
    expect(playlistsNextPageParam(pages[0]!, pages)).toBeUndefined()
  })
})

describe('flattenPlaylists', () => {
  test('concatenates pages in order', () => {
    const flat = flattenPlaylists([page(2, 4), page(2, 4, 2)])
    expect(flat.map((p) => p.id)).toEqual([0, 1, 2, 3])
  })

  test('returns [] for undefined', () => {
    expect(flattenPlaylists(undefined)).toEqual([])
  })
})
