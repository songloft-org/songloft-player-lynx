import { create } from 'zustand'

import type { AnchorMeasurement } from './anchored-overlay.js'
import type { Song } from '../../models/song.js'

interface SongRowOverlayState {
  /** The song whose context menu is open; null while closed. */
  menuSong: Song | null
  /**
   * Where to put that menu — the trigger box measured by the row as it dispatched.
   * Null when the host could not measure it, which docks the menu instead.
   */
  menuAnchor: AnchorMeasurement | null
  /** The song being added to a playlist; null while that sheet is closed. */
  addToPlaylistSong: Song | null
  /** The song awaiting delete confirmation; null while the dialog is closed. */
  deleteSong: Song | null
  openMenu: (song: Song, anchor?: AnchorMeasurement | null) => void
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
 * Which is also why the *anchor* travels with the song: the menu is a popover on
 * the row's `⋯`, but only the row can measure that button, and by the time the
 * menu renders it is in a different subtree entirely.
 *
 * The three overlays are mutually exclusive: opening one closes the others, so
 * the back-stack never has to order them against each other.
 */
export const useSongRowOverlays = create<SongRowOverlayState>((set) => ({
  menuSong: null,
  menuAnchor: null,
  addToPlaylistSong: null,
  deleteSong: null,
  openMenu: (song, anchor) =>
    set({ menuSong: song, menuAnchor: anchor ?? null, addToPlaylistSong: null, deleteSong: null }),
  closeMenu: () => set({ menuSong: null, menuAnchor: null }),
  openAddToPlaylist: (song) =>
    set({ addToPlaylistSong: song, menuSong: null, menuAnchor: null, deleteSong: null }),
  closeAddToPlaylist: () => set({ addToPlaylistSong: null }),
  requestDelete: (song) =>
    set({ deleteSong: song, menuSong: null, menuAnchor: null, addToPlaylistSong: null }),
  cancelDelete: () => set({ deleteSong: null }),
}))

/** Imperative access for non-hook callers (none yet — rows are all hooks). */
export const songRowOverlays = {
  openMenu: (song: Song, anchor?: AnchorMeasurement | null) =>
    useSongRowOverlays.getState().openMenu(song, anchor),
  openAddToPlaylist: (song: Song) =>
    useSongRowOverlays.getState().openAddToPlaylist(song),
}
