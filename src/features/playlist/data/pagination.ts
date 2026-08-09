import type { Playlist, PlaylistListResponse } from '../../../models/playlist.js'
import { nextOffset } from '../../library/data/pagination.js'

/**
 * Pure pagination helpers for the playlist list `useInfiniteQuery`, mirroring the
 * library batch's "advance while accumulated < total, stop at the end" rule.
 * Kept free of React / TanStack Query so the offset accounting is unit-testable
 * without a render tree.
 *
 * The songs *inside* a playlist page over the same `SongListResponse` envelope
 * as the library, so those flows reuse `songsNextPageParam` / `flattenSongs`
 * from `../../library/data/pagination.js` directly (no duplication here).
 */

/** Total playlists accumulated across the loaded pages. */
export function playlistsLoadedCount(pages: readonly PlaylistListResponse[]): number {
  return pages.reduce((sum, page) => sum + page.playlists.length, 0)
}

/** `getNextPageParam` for the playlists infinite query. */
export function playlistsNextPageParam(
  lastPage: PlaylistListResponse,
  allPages: readonly PlaylistListResponse[],
): number | undefined {
  return nextOffset(playlistsLoadedCount(allPages), lastPage.total)
}

/** Flatten loaded playlist pages into a single ordered list. */
export function flattenPlaylists(
  pages: readonly PlaylistListResponse[] | undefined,
): Playlist[] {
  if (!pages) return []
  return pages.flatMap((page) => page.playlists)
}
