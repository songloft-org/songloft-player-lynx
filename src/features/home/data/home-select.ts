import type { PlaylistListResponse, Playlist } from '../../../models/playlist.js'
import { flattenPlaylists } from '../../playlist/data/pagination.js'

/**
 * Pure selectors deriving the home page's view-model from the playlist infinite
 * query pages. Kept free of React / TanStack Query so the "cap the section to N
 * cards" and stats accounting are unit-testable without a render tree.
 *
 * The home sections mirror the Flutter home (`_buildContent`): a bounded preview
 * of each playlist `type` with a "View all" escape hatch, plus a bottom stats
 * strip fed by the backend `total` (not the truncated preview length).
 */

/** Default number of playlist cards shown per home section before "View all". */
export const HOME_SECTION_LIMIT = 6

/** Flatten the loaded pages and cap to at most `limit` cards for a section. */
export function homeSectionItems(
  pages: readonly PlaylistListResponse[] | undefined,
  limit: number = HOME_SECTION_LIMIT,
): Playlist[] {
  const all = flattenPlaylists(pages)
  return limit > 0 ? all.slice(0, limit) : all
}

/**
 * Backend total for the section (each page echoes the same `total`); falls back
 * to the loaded length when the server omits it. Used by the stats strip so the
 * count reflects the whole library, not the truncated preview.
 */
export function homeSectionTotal(
  pages: readonly PlaylistListResponse[] | undefined,
): number {
  if (!pages || pages.length === 0) return 0
  const total = pages[0]!.total
  return total > 0 ? total : flattenPlaylists(pages).length
}

export interface HomeStats {
  normal: number
  radio: number
  total: number
}

/** Combine the two section totals into the bottom strip's three figures. */
export function homeStats(normalTotal: number, radioTotal: number): HomeStats {
  return { normal: normalTotal, radio: radioTotal, total: normalTotal + radioTotal }
}
