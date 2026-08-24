import { LIBRARY_VIEW_KEYS } from '../../../models/library-browse.js'
import { isPlaylistLibraryView, LIBRARY_VIEW_GROUP, type LibraryViewKey } from './library-views.js'

/** `/library/category/<field>` — the facet drill-in. Mirrors `route-back.ts`. */
const CATEGORY_PREFIX = '/library/category/'

/** `/library/song/<id>` — song detail. Mirrors `route-back.ts`. */
const SONG_PREFIX = '/library/song/'

/** `/library/song/<id>/edit` — the song edit form. Mirrors `route-back.ts`. */
const SONG_EDIT_RE = /^\/library\/song\/\d+\/edit$/

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
 * Everything else (add-songs, create-playlist, song detail, playlist detail) has
 * no view of its own and falls back to the last library view visited.
 *
 * Takes the *anchor* path, not necessarily the current one — see
 * {@link railAnchorPath}.
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
 *
 * Takes the *anchor* path, not necessarily the current one — see
 * {@link railAnchorPath}.
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

/**
 * The path the two functions above should answer for.
 *
 * Song detail is the one route under this layout with several entry points —
 * the library list, a facet drill-in, a playlist detail, the full player — and
 * it carries nothing that says which. Deriving the highlight from its own
 * pathname therefore drops that context and falls back to the last *library*
 * view: opening a song from a playlist reached from Home lit 全部 while the two
 * screens before it were 全部歌单 and a playlist, and drilling from 歌手 into a
 * song dropped 歌手 the same way.
 *
 * So the rail borrows the origin the navigation helper already records for
 * `resolveRouteBack` (`navigate-to-song-detail.ts`): back and the highlight then
 * agree by construction, because they read one recording. A song→song hop keeps
 * the first origin (the helper's rule), so the highlight does not drift either.
 *
 * The edit page plays the same game with its own origin: opened from a song
 * menu on a playlist it anchors to that playlist, and opened from the song
 * detail page it anchors like the detail page does (its origin is a song path,
 * so it unwraps one level further to the detail page's own origin).
 *
 * Every other route answers for itself.
 */
export function railAnchorPath(
  pathname: string,
  songDetailFrom: string | null | undefined,
  songEditFrom?: string | null,
): string {
  if (SONG_EDIT_RE.test(pathname)) {
    if (songEditFrom && !songEditFrom.startsWith(SONG_PREFIX)) return songEditFrom
    // Opened from the song detail page (or nothing recorded): anchor like the
    // detail page would.
    const detailPath = pathname.slice(0, pathname.lastIndexOf('/edit'))
    return railAnchorPath(detailPath, songDetailFrom)
  }
  if (!pathname.startsWith(SONG_PREFIX)) return pathname
  // Nothing recorded (direct entry) or a stale song path: no better anchor.
  if (!songDetailFrom || songDetailFrom.startsWith(SONG_PREFIX)) return pathname
  return songDetailFrom
}
