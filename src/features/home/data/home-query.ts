import type { PlaylistType } from '../../../core/config/constants.js'
// Reuse the playlist feature's infinite query + authenticated client singleton
// (batch 6). The home page just fixes the `type` filter (normal / radio) and
// previews the first page(s); no new API surface is introduced.
import { usePlaylistsInfiniteQuery } from '../../playlist/data/playlist-query.js'

/**
 * Home page data access. The two home sections ("My Playlists" = `normal`,
 * "My Radios" = `radio`) are just the batch-6 playlist list filtered by `type`,
 * so this reuses {@link usePlaylistsInfiniteQuery} rather than adding a new
 * endpoint. Kept as a named hook so render tests can mock exactly this seam.
 */
export function useHomePlaylists(type: PlaylistType) {
  return usePlaylistsInfiniteQuery({ type })
}
