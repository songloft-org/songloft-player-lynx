import type { Song, SongFacet, SongListResponse, SongFacetResponse } from '../../../models/song.js'

/**
 * Pure pagination helpers for the library `useInfiniteQuery` flows, mirroring
 * the Flutter `SongsListNotifier.loadMore` / `hasMore` accounting. Kept free of
 * React / TanStack Query so the "advance while accumulated < total, stop at the
 * end" logic is unit-testable without a render tree (batch-4 test rule).
 *
 * The `getNextPageParam` contract used across the feature: the **next offset**
 * is the number of items already accumulated; return `undefined` once that
 * reaches (or exceeds) the server `total`, which signals TanStack Query that
 * there is no next page (`hasNextPage → false`).
 */

/** Next `offset` param given how many items are loaded, or `undefined` at the end. */
export function nextOffset(loadedCount: number, total: number): number | undefined {
  return loadedCount < total ? loadedCount : undefined
}

/** Whether more items remain after the currently accumulated set. */
export function hasMore(loadedCount: number, total: number): boolean {
  return loadedCount < total
}

// ── Songs (`{ songs, total }` pages) ─────────────────────────────────────────

/** Total songs accumulated across the loaded pages. */
export function songsLoadedCount(pages: readonly SongListResponse[]): number {
  return pages.reduce((sum, page) => sum + page.songs.length, 0)
}

/** `getNextPageParam` for the songs infinite query. */
export function songsNextPageParam(
  lastPage: SongListResponse,
  allPages: readonly SongListResponse[],
): number | undefined {
  return nextOffset(songsLoadedCount(allPages), lastPage.total)
}

/** Flatten loaded song pages into a single ordered list. */
export function flattenSongs(pages: readonly SongListResponse[] | undefined): Song[] {
  if (!pages) return []
  return pages.flatMap((page) => page.songs)
}

// ── Facets (`{ facets, total }` pages) ───────────────────────────────────────

/** Total facets accumulated across the loaded pages. */
export function facetsLoadedCount(pages: readonly SongFacetResponse[]): number {
  return pages.reduce((sum, page) => sum + page.facets.length, 0)
}

/** `getNextPageParam` for the facets infinite query. */
export function facetsNextPageParam(
  lastPage: SongFacetResponse,
  allPages: readonly SongFacetResponse[],
): number | undefined {
  return nextOffset(facetsLoadedCount(allPages), lastPage.total)
}

/** Flatten loaded facet pages into a single ordered list. */
export function flattenFacets(pages: readonly SongFacetResponse[] | undefined): SongFacet[] {
  if (!pages) return []
  return pages.flatMap((page) => page.facets)
}
