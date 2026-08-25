import { LIBRARY_VIEW_KEYS } from '../../../models/library-browse.js'
import { isPlaylistLibraryView, LIBRARY_VIEW_GROUP, type LibraryViewKey } from './library-views.js'

/** `/library/category/<field>` — the facet drill-in. Mirrors `route-back.ts`. */
const CATEGORY_PREFIX = '/library/category/'

function asViewKey(value: string): LibraryViewKey | undefined {
  return (LIBRARY_VIEW_KEYS as readonly string[]).includes(value)
    ? value as LibraryViewKey
    : undefined
}

/**
 * Which view the rail should ask `resolveLibraryView` for, on any route under the
 * library layout.
 *
 * Pure, and separate from the layout, for the same reason `resolveRouteBack` is:
 * the mapping is per-route policy, it is easy to get subtly wrong, and a table in
 * one place beats the rail highlighting one thing while the page shows another.
 *
 * `?view=` wins (the library root owns it). Otherwise a facet drill-in names its
 * own dimension — the 7 facet dimensions *are* view keys, which is what lets
 * `/library/category/artist` light up 歌手 rather than whatever was visited last.
 * Everything else (add-songs, create-playlist, playlist detail) has no view of
 * its own and falls back to the last library view visited.
 */
export function requestedRailView(
  pathname: string,
  searchView: LibraryViewKey | undefined,
  lastView: LibraryViewKey | undefined,
): LibraryViewKey | undefined {
  if (searchView) return searchView
  if (pathname.startsWith(CATEGORY_PREFIX)) {
    const field = asViewKey(pathname.slice(CATEGORY_PREFIX.length))
    if (field && LIBRARY_VIEW_GROUP[field] === 'facets') return field
  }
  return lastView
}

/**
 * The row to highlight, given what `resolveLibraryView` settled on.
 *
 * Only playlist routes need adjusting: a playlist detail reached from Home (or
 * from a facet view) carries no library view at all, so the fallback above would
 * light up the first visible view — 全部, a *songs* view, while the page shows a
 * playlist. Anchor those routes to the playlists group instead, and to a key that
 * is actually on the rail: picking a hidden one would quietly re-add it, which is
 * a deep-link affordance and not something a derived highlight should trigger.
 *
 * Returns `undefined` when nothing fits (every playlist view hidden) — an
 * un-highlighted rail is honest, a wrongly-highlighted one is not.
 */
export function railSelection(
  pathname: string,
  resolved: LibraryViewKey | undefined,
  displayKeys: readonly LibraryViewKey[],
): LibraryViewKey | undefined {
  if (!pathname.startsWith('/playlists')) return resolved
  if (resolved && isPlaylistLibraryView(resolved)) return resolved
  return displayKeys.find(isPlaylistLibraryView)
}
