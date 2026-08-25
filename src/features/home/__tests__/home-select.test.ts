import { describe, expect, test } from 'vitest'

import type { PlaylistListResponse } from '../../../models/playlist.js'
import type { Playlist } from '../../../models/playlist.js'
import { HOME_SECTION_LIMIT, homeSectionItems } from '../data/home-select.js'

function pl(id: number): Playlist {
  return {
    id,
    type: 'normal',
    name: `PL ${id}`,
    description: undefined,
    coverUrl: undefined,
    labels: [],
    songCount: 0,
    sortBy: 'position',
    sortOrder: 'asc',
    createdAt: '',
    updatedAt: '',
    isBuiltIn: false,
    isAutoCreated: false,
    isHidden: false,
    pinnedAt: undefined,
    isPinned: false,
  }
}

function page(ids: number[], total: number): PlaylistListResponse {
  return { playlists: ids.map(pl), total }
}

describe('homeSectionItems', () => {
  test('returns [] when pages are undefined', () => {
    expect(homeSectionItems(undefined)).toEqual([])
  })

  test('flattens loaded pages into one list', () => {
    const items = homeSectionItems([page([1, 2], 5), page([3], 5)])
    expect(items.map((p) => p.id)).toEqual([1, 2, 3])
  })

  test('caps to the default section limit', () => {
    const many = Array.from({ length: 12 }, (_, i) => i + 1)
    const items = homeSectionItems([page(many, 12)])
    expect(items).toHaveLength(HOME_SECTION_LIMIT)
    expect(items[0]!.id).toBe(1)
  })

  test('honours a custom limit and returns all when limit <= 0', () => {
    expect(homeSectionItems([page([1, 2, 3], 3)], 2)).toHaveLength(2)
    expect(homeSectionItems([page([1, 2, 3], 3)], 0)).toHaveLength(3)
  })
})

// `homeSectionTotal` / `homeStats` are gone: the stats panel reads `/songs/stats`
// rather than being summed from playlist counts. Their replacements are covered by
// `stats-format.test.ts` (formatting) and `home-page.test.tsx` (rendering).
