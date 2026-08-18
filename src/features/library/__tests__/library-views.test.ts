import { describe, expect, test } from 'vitest'

import { en } from '../../../i18n/resources.js'
import {
  DEFAULT_LIBRARY_BROWSE_CONFIG,
  LIBRARY_VIEW_KEYS,
  type LibraryBrowseView,
  type LibraryViewKey,
} from '../../../models/library-browse.js'
import {
  facetViewField,
  flatViewType,
  groupedFlatten,
  groupLibraryViewKeys,
  LIBRARY_VIEW_GROUP,
  LIBRARY_VIEW_GROUP_LABEL_KEY,
  LIBRARY_VIEW_ICON,
  LIBRARY_VIEW_LABEL_KEY,
  migrateLibrarySearch,
  moveGroup,
  playlistViewType,
  resolveLibraryView,
  setGroupOrder,
} from '../domain/library-views.js'

/** Build a full 14-view config from an ordered key list (all visible). */
function configOf(keys: LibraryViewKey[], hidden: LibraryViewKey[] = []) {
  return {
    views: keys.map((key): LibraryBrowseView => ({ key, visible: !hidden.includes(key) })),
  }
}

function keysOf(result: { displayKeys: LibraryViewKey[] }): LibraryViewKey[] {
  return result.displayKeys
}

describe('view tables', () => {
  test('every table covers exactly the 14 backend keys', () => {
    const expected = [...LIBRARY_VIEW_KEYS].sort()
    expect(Object.keys(LIBRARY_VIEW_GROUP).sort()).toEqual(expected)
    expect(Object.keys(LIBRARY_VIEW_LABEL_KEY).sort()).toEqual(expected)
    expect(Object.keys(LIBRARY_VIEW_ICON).sort()).toEqual(expected)
    expect(Object.keys(LIBRARY_VIEW_GROUP_LABEL_KEY).sort()).toEqual(['facets', 'playlists', 'songs'])
  })

  test('group membership matches the backend’s three contiguous runs', () => {
    expect(LIBRARY_VIEW_GROUP.all).toBe('songs')
    expect(LIBRARY_VIEW_GROUP.radio).toBe('songs')
    expect(LIBRARY_VIEW_GROUP.artist).toBe('facets')
    expect(LIBRARY_VIEW_GROUP.style).toBe('facets')
    expect(LIBRARY_VIEW_GROUP.playlist).toBe('playlists')
    expect(LIBRARY_VIEW_GROUP.playlist_radio).toBe('playlists')
  })

  /**
   * Dynamic-key i18n gate. The repo's i18n test only scans *literal* `t('…')`
   * calls; these labels are looked up through the tables above, so a typo here
   * would render as its own key in both languages while every gate stays green
   * (AGENTS §6). Resolve every value against the real resource tree.
   */
  test('every label key resolves to a non-empty English string', () => {
    const lookup = (path: string): unknown =>
      path.split('.').reduce<unknown>((node, part) =>
        node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined, en)
    for (const key of Object.values(LIBRARY_VIEW_LABEL_KEY)) {
      const value = lookup(key)
      expect(typeof value === 'string' && value.length > 0, `${key} must resolve`).toBe(true)
    }
    for (const key of Object.values(LIBRARY_VIEW_GROUP_LABEL_KEY)) {
      const value = lookup(key)
      expect(typeof value === 'string' && value.length > 0, `${key} must resolve`).toBe(true)
    }
  })
})

describe('groupLibraryViewKeys', () => {
  test('default order yields three groups: songs, facets, playlists', () => {
    const buckets = groupLibraryViewKeys([...LIBRARY_VIEW_KEYS])
    expect(buckets.map((b) => b.group)).toEqual(['songs', 'facets', 'playlists'])
    expect(buckets[0]!.keys).toEqual(['all', 'local', 'remote', 'radio'])
    expect(buckets[1]!.keys).toEqual(['artist', 'album', 'genre', 'year', 'decade', 'language', 'style'])
    expect(buckets[2]!.keys).toEqual(['playlist', 'playlist_normal', 'playlist_radio'])
  })

  test('group order is implicit — playlists first in, playlists first out', () => {
    const keys: LibraryViewKey[] = [
      'playlist', 'playlist_normal', 'playlist_radio',
      'artist', 'album',
      'all', 'local',
    ]
    const buckets = groupLibraryViewKeys(keys)
    expect(buckets.map((b) => b.group)).toEqual(['playlists', 'facets', 'songs'])
  })

  test('a non-contiguous config still collects each group into ONE bucket', () => {
    // The backend normalize appends missing keys at the end in ITS default
    // order, so a user config saved before a new key existed can look like
    // this. `local` must land at the end of the songs bucket, not start a
    // fourth run.
    const buckets = groupLibraryViewKeys(['playlist', 'all', 'artist', 'local'])
    expect(buckets.map((b) => b.group)).toEqual(['playlists', 'songs', 'facets'])
    expect(buckets.find((b) => b.group === 'songs')!.keys).toEqual(['all', 'local'])
  })
})

describe('groupedFlatten', () => {
  test('regroups interleaved views into contiguous group runs', () => {
    const views: LibraryBrowseView[] = [
      { key: 'all', visible: true },
      { key: 'artist', visible: true },
      { key: 'local', visible: false },
      { key: 'playlist', visible: true },
    ]
    expect(groupedFlatten(views).map((v) => v.key)).toEqual(['all', 'local', 'artist', 'playlist'])
    // Visibility survives the regroup.
    expect(groupedFlatten(views).find((v) => v.key === 'local')!.visible).toBe(false)
  })
})

describe('moveGroup', () => {
  const views = DEFAULT_LIBRARY_BROWSE_CONFIG.views

  test('moves a whole group earlier/later, internal order intact', () => {
    const moved = moveGroup(views, 'facets', 1)
    const groups = groupLibraryViewKeys(moved.map((v) => v.key))
    expect(groups.map((g) => g.group)).toEqual(['songs', 'playlists', 'facets'])
    expect(groups[2]!.keys).toEqual(['artist', 'album', 'genre', 'year', 'decade', 'language', 'style'])
  })

  test('first group up / last group down are no-ops', () => {
    expect(moveGroup(views, 'songs', -1)).toBe(views)
    expect(moveGroup(views, 'playlists', 1)).toBe(views)
  })
})

describe('setGroupOrder', () => {
  test('reorders only the target group; other groups stay byte-identical', () => {
    const views = DEFAULT_LIBRARY_BROWSE_CONFIG.views
    const next = setGroupOrder(views, 'facets', ['genre', 'artist', 'album', 'year', 'decade', 'language', 'style'])
    const buckets = groupLibraryViewKeys(next.map((v) => v.key))
    expect(buckets.find((b) => b.group === 'facets')!.keys[0]).toBe('genre')
    expect(buckets.find((b) => b.group === 'songs')!.keys).toEqual(['all', 'local', 'remote', 'radio'])
    expect(buckets.find((b) => b.group === 'playlists')!.keys).toEqual(['playlist', 'playlist_normal', 'playlist_radio'])
    expect(next).toHaveLength(14)
  })

  test('ignores keys from other groups and keeps any omitted member', () => {
    const views = DEFAULT_LIBRARY_BROWSE_CONFIG.views
    const next = setGroupOrder(views, 'songs', ['local', 'all', 'artist'])
    const songs = groupLibraryViewKeys(next.map((v) => v.key)).find((b) => b.group === 'songs')!.keys
    // `artist` is not a songs-group key → ignored; `remote`/`radio` were not
    // listed → appended, never dropped.
    expect(songs).toEqual(['local', 'all', 'remote', 'radio'])
  })
})

describe('content dispatch', () => {
  test('flatViewType: `all` sends no type', () => {
    expect(flatViewType('all')).toBeUndefined()
    expect(flatViewType('local')).toBe('local')
    expect(flatViewType('remote')).toBe('remote')
    expect(flatViewType('radio')).toBe('radio')
    expect(flatViewType('artist')).toBeUndefined()
  })

  test('playlistViewType: `playlist` sends no type', () => {
    expect(playlistViewType('playlist')).toBeUndefined()
    expect(playlistViewType('playlist_normal')).toBe('normal')
    expect(playlistViewType('playlist_radio')).toBe('radio')
    expect(playlistViewType('all')).toBeUndefined()
  })

  test('facetViewField: only the 7 facet dimensions', () => {
    expect(facetViewField('radio')).toBeUndefined()
    expect(facetViewField('playlist')).toBeUndefined()
    for (const key of ['artist', 'album', 'genre', 'year', 'decade', 'language', 'style'] as const) {
      expect(facetViewField(key)).toBe(key)
    }
  })
})

describe('resolveLibraryView', () => {
  test('no request → first visible view', () => {
    const resolved = resolveLibraryView(undefined, DEFAULT_LIBRARY_BROWSE_CONFIG)
    expect(resolved.selected).toBe('all')
    expect(keysOf(resolved)).toEqual([...LIBRARY_VIEW_KEYS])
  })

  test('visible request → that view', () => {
    const resolved = resolveLibraryView('genre', DEFAULT_LIBRARY_BROWSE_CONFIG)
    expect(resolved.selected).toBe('genre')
    expect(keysOf(resolved)).toEqual([...LIBRARY_VIEW_KEYS])
  })

  test('hidden-but-valid request → selected AND slotted back at its config position', () => {
    const config = configOf([...LIBRARY_VIEW_KEYS], ['year'])
    const resolved = resolveLibraryView('year', config)
    expect(resolved.selected).toBe('year')
    // Not pushed to the end: `year` sits between `genre` and `decade` again.
    expect(keysOf(resolved)).toEqual([
      'all', 'local', 'remote', 'radio',
      'artist', 'album', 'genre', 'year', 'decade', 'language', 'style',
      'playlist', 'playlist_normal', 'playlist_radio',
    ])
  })

  test('hidden first view with no request → falls to the next visible one', () => {
    const config = configOf([...LIBRARY_VIEW_KEYS], ['all'])
    const resolved = resolveLibraryView(undefined, config)
    expect(resolved.selected).toBe('local')
    expect(keysOf(resolved)).toEqual([...LIBRARY_VIEW_KEYS].filter((k) => k !== 'all'))
  })

  test('everything hidden → no selection, empty display', () => {
    const config = configOf([...LIBRARY_VIEW_KEYS], [...LIBRARY_VIEW_KEYS])
    const resolved = resolveLibraryView(undefined, config)
    expect(resolved.selected).toBeUndefined()
    expect(keysOf(resolved)).toEqual([])
  })

  test('invalid request → first visible view', () => {
    expect(resolveLibraryView('folder', DEFAULT_LIBRARY_BROWSE_CONFIG).selected).toBe('all')
    expect(resolveLibraryView('', DEFAULT_LIBRARY_BROWSE_CONFIG).selected).toBe('all')
  })
})

describe('migrateLibrarySearch', () => {
  test('current view keys pass through', () => {
    expect(migrateLibrarySearch({ view: 'decade' })).toEqual({ view: 'decade' })
    expect(migrateLibrarySearch({ view: 'playlist_radio' })).toEqual({ view: 'playlist_radio' })
  })

  test('legacy four-tab values migrate (except radio — see the collision note)', () => {
    expect(migrateLibrarySearch({ view: 'songs' })).toEqual({ view: 'all' })
    expect(migrateLibrarySearch({ view: 'facets' })).toEqual({ view: 'artist' })
    expect(migrateLibrarySearch({ view: 'playlists' })).toEqual({ view: 'playlist_normal' })
    // `radio` collides with the new songs-group key, and new keys win: the
    // in-app pill tap navigates `?view=radio`, so legacy-first mapping would
    // hijack it. Old deep links land on radio songs — documented drift.
    expect(migrateLibrarySearch({ view: 'radio' })).toEqual({ view: 'radio' })
  })

  test('legacy field param wins (old deep links: ?view=facets&field=genre)', () => {
    expect(migrateLibrarySearch({ view: 'facets', field: 'genre' })).toEqual({ view: 'genre' })
  })

  test('unknown or missing values → no view', () => {
    expect(migrateLibrarySearch({})).toEqual({})
    expect(migrateLibrarySearch({ view: 'folder' })).toEqual({})
    expect(migrateLibrarySearch({ view: 42 })).toEqual({})
  })
})
