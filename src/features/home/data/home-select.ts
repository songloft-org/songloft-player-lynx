import type { PlaylistListResponse, Playlist } from '../../../models/playlist.js'
import { flattenPlaylists } from '../../playlist/data/pagination.js'

/**
 * Pure selectors deriving the home page's view-model from the playlist infinite
 * query pages. Kept free of React / TanStack Query so the "cap the section to N
 * cards" rule is unit-testable without a render tree.
 *
 * The home sections mirror the Flutter home (`_buildContent`): a bounded preview
 * of each playlist `type` with a "View all" escape hatch.
 *
 * The section-total / stats selectors that used to live here are gone: the stats
 * panel now reads `GET /songs/stats` (`data/home-stats-query.ts`) instead of being
 * assembled from playlist counts, which is what it looked like it was showing.
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

