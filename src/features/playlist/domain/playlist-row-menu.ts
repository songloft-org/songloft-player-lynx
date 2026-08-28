import type { Playlist } from '../../../models/playlist.js'

/**
 * Which actions a playlist's row / card menu offers, as item keys.
 *
 * Pinning is the one entry every playlist keeps: the backend deliberately skips
 * its usual built-in guard for the pin endpoint, so Favorites and Radio
 * favorites are pinnable too. Edit / hide / delete stay owner-playlists-only —
 * the same `isBuiltIn` split the detail page's overflow menu uses.
 *
 * Kept as a pure function (no `t()`) so the built-in-vs-normal rule is unit
 * testable without rendering; the caller maps keys to labelled menu items.
 */
export function playlistRowMenuKeys(playlist: Playlist): string[] {
  return playlist.isBuiltIn
    ? ['pin']
    : ['pin', 'convertToTag', 'edit', 'visibility', 'delete']
}
