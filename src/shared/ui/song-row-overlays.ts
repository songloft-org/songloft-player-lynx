import { create } from 'zustand'

import type { Song } from '../../models/song.js'

interface SongRowOverlayState {
  /** The song whose context menu is open; null while closed. */
  menuSong: Song | null
  /** The song being added to a playlist; null while that sheet is closed. */
  addToPlaylistSong: Song | null
  /** The song awaiting delete confirmation; null while the dialog is closed. */
  deleteSong: Song | null
  openMenu: (song: Song) => void
  closeMenu: () => void
  openAddToPlaylist: (song: Song) => void
  closeAddToPlaylist: () => void
  requestDelete: (song: Song) => void
  cancelDelete: () => void
}

/**
 * Global overlay state for the song-row menu, the add-to-playlist sheet and the
 * delete confirm.
 *
 * The overlays themselves mount **once in the root route** (`SongRowOverlays`),
 * not inside the rows: every song list is a virtualized Lynx `<list>`, and a
 * `position: fixed` overlay inside a `<list-item>` is re-anchored and clipped
 * by the list's paint containment (web: `position: relative` +
 * `content-visibility: auto` on `x-list::part(content)` makes it the containing
 * block; native: the list clips to its own viewport). Per-row mounts therefore
 * rendered nowhere or anchored to the row's slot — this store exists so rows
 * can dispatch from inside any list while the overlay stays outside all of
 * them.
 *
 * The three overlays are mutually exclusive: opening one closes the others, so
 * the back-stack never has to order them against each other.
 */
export const useSongRowOverlays = create<SongRowOverlayState>((set) => ({
  menuSong: null,
  addToPlaylistSong: null,
  deleteSong: null,
  openMenu: (song) => set({ menuSong: song, addToPlaylistSong: null, deleteSong: null }),
  closeMenu: () => set({ menuSong: null }),
  openAddToPlaylist: (song) =>
    set({ addToPlaylistSong: song, menuSong: null, deleteSong: null }),
  closeAddToPlaylist: () => set({ addToPlaylistSong: null }),
  requestDelete: (song) =>
    set({ deleteSong: song, menuSong: null, addToPlaylistSong: null }),
  cancelDelete: () => set({ deleteSong: null }),
}))

/** Imperative access for non-hook callers (none yet — rows are all hooks). */
export const songRowOverlays = {
  openMenu: (song: Song) => useSongRowOverlays.getState().openMenu(song),
  openAddToPlaylist: (song: Song) =>
    useSongRowOverlays.getState().openAddToPlaylist(song),
}
