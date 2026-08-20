import { expect, test } from 'vitest'

import { requestedRailView, railSelection } from '../domain/library-rail-view.js'
import { LIBRARY_VIEW_KEYS } from '../../../models/library-browse.js'
import type { LibraryViewKey } from '../domain/library-views.js'

/**
 * Rail highlight policy for every route under `LibraryLayout`.
 *
 * The rail persists across those routes, so the highlight is the only thing that
 * says where you are. Getting it wrong is silent: a rail pointing at 全部 while
 * the pane shows a playlist looks like a plausible rail.
 */

test('?view= wins — the library root owns the selection', () => {
  expect(requestedRailView('/library', 'genre', 'artist')).toBe('genre')
})

test('a facet drill-in names its own dimension, not the last view visited', () => {
  expect(requestedRailView('/library/category/artist', undefined, 'all')).toBe('artist')
  expect(requestedRailView('/library/category/decade', undefined, 'playlist')).toBe('decade')
})

test('all 7 facet dimensions are resolvable from their drill-in path', () => {
  const facets = (LIBRARY_VIEW_KEYS as readonly LibraryViewKey[])
    .filter(k => ['artist', 'album', 'genre', 'year', 'decade', 'language', 'style'].includes(k))
  expect(facets).toHaveLength(7)
  for (const f of facets) {
    expect(requestedRailView(`/library/category/${f}`, undefined, undefined)).toBe(f)
  }
})

test('a junk or non-facet category segment falls back instead of highlighting nonsense', () => {
  expect(requestedRailView('/library/category/not-a-view', undefined, 'local')).toBe('local')
  // `all` is a real view key but a songs view — never a facet drill-in.
  expect(requestedRailView('/library/category/all', undefined, 'local')).toBe('local')
})

test('pages with no view of their own fall back to the last library view', () => {
  for (const p of ['/library/add', '/playlists/create', '/library/song/42', '/playlists/7']) {
    expect(requestedRailView(p, undefined, 'radio')).toBe('radio')
  }
  expect(requestedRailView('/library/add', undefined, undefined)).toBeUndefined()
})

const ALL: LibraryViewKey[] = [...LIBRARY_VIEW_KEYS] as LibraryViewKey[]

test('non-playlist routes keep whatever the resolver settled on', () => {
  expect(railSelection('/library', 'artist', ALL)).toBe('artist')
  expect(railSelection('/library/category/genre', 'genre', ALL)).toBe('genre')
  expect(railSelection('/library/add', 'all', ALL)).toBe('all')
})

test('a playlist route already on a playlist view is left alone', () => {
  expect(railSelection('/playlists/7', 'playlist_radio', ALL)).toBe('playlist_radio')
})

/*
 * The case this function exists for: reaching a playlist from Home leaves no
 * library view behind, so the resolver returns the first visible one — a songs
 * view — while the pane shows a playlist.
 */
test('a playlist route anchored on a songs view moves to the playlists group', () => {
  expect(railSelection('/playlists/7', 'all', ALL)).toBe('playlist')
  expect(railSelection('/playlists/create', 'artist', ALL)).toBe('playlist')
})

test('it anchors to a VISIBLE playlist view — a derived highlight must not re-add a hidden one', () => {
  const hiddenAllPlaylists: LibraryViewKey[] = ['all', 'artist', 'playlist_radio']
  expect(railSelection('/playlists/7', 'all', hiddenAllPlaylists)).toBe('playlist_radio')
})

test('every playlist view hidden → nothing highlighted, rather than something wrong', () => {
  expect(railSelection('/playlists/7', 'all', ['all', 'artist'])).toBeUndefined()
})
