import { create } from 'zustand'

import type { AnchorMeasurement } from './anchored-overlay.js'
import type { Song } from '../../models/song.js'

export interface OpenAddToPlaylistParams {
  /** The songs to offer a destination for — one row, or a whole selection. */
  songIds: number[]
  /**
   * Called once the add succeeded. The library's multi-select passes its
   * "leave select mode" here so a cancelled sheet keeps the selection intact,
   * which closing alone cannot distinguish.
   */
  onAdded?: () => void
}

interface SongRowOverlayState {
  /** The song whose context menu is open; null while closed. */
  menuSong: Song | null
  /**
   * Where to put that menu — the trigger box measured by the row as it dispatched.
   * Null when the host could not measure it, which docks the menu instead.
   */
  menuAnchor: AnchorMeasurement | null
  /** The songs being added to a playlist; empty while that sheet is closed. */
  addToPlaylistSongIds: number[]
  /** Success callback for the open sheet; null when the caller wants none. */
  addToPlaylistOnAdded: (() => void) | null
  /** The song awaiting delete confirmation; null while the dialog is closed. */
  deleteSong: Song | null
  /** The song whose read-only info dialog is open; null while closed. */
  infoSong: Song | null
  /** The song whose edit dialog is open; null while closed. */
  editSong: Song | null
  openMenu: (song: Song, anchor?: AnchorMeasurement | null) => void
  closeMenu: () => void
  openAddToPlaylist: (params: OpenAddToPlaylistParams) => void
  closeAddToPlaylist: () => void
  requestDelete: (song: Song) => void
  cancelDelete: () => void
  openInfo: (song: Song) => void
  closeInfo: () => void
  openEdit: (song: Song) => void
  closeEdit: () => void
}

/**
 * Global overlay state for the song-row menu, the add-to-playlist sheet and the
 * delete confirm.
 *
 * The overlays themselves mount **once in the root route** (`SongRowOverlays`),
 * not inside the rows. This is not a preference — an in-row menu was built and
 * measured, and the numbers are below. Read them before "simplifying" this away.
 *
 * ## Why an overlay cannot live in a song row (measured, Web)
 *
 * Every song list is a virtualized Lynx `<list>`. Probed in Chrome against the
 * standalone build (web-elements 0.12.7), on the library page:
 *
 *  - `x-list` computes to **`contain: layout`** + `container-type: size`, and layout
 *    containment makes it *the containing block for fixed-position descendants*. A
 *    probe declared `position: fixed; left: 0; top: 0` inside a `list-item` rendered
 *    at **(440, 273.5)** — exactly the list's own origin, not the viewport's. So the
 *    lynx-view coordinates `anchored-overlay.ts` measures would be off by the list's
 *    offset, and a second coordinate space would have to exist to fix that.
 *  - `x-list::part(content)` is **`overflow: hidden scroll`** (plus
 *    `content-visibility: auto`). Probes placed above and below that box both failed
 *    `document.elementFromPoint` — clipped, not merely invisible. A scroll container
 *    always clips, so this one cannot be undone by any stylesheet.
 *  - Every Lynx element maps to `position: relative; overflow: clip` on Web
 *    (web-elements `common-css/linear.css`), `list-item` included, so the panel is
 *    cut to the row's own ~73px box until each ancestor between it and the list is
 *    reopened one rule at a time.
 *
 * What that adds up to, from the actual experiment (~95 lines net): the menu can only
 * ever be visible **inside the list viewport** — measured at **371.5px** tall in a
 * desktop window, against a four-row menu of ~190px, so the bottom rows get sliced;
 * there can be no outside-tap backdrop, because a full-screen catcher is clipped by
 * the same scroll container; and two rows can hold two menus open at once unless a
 * shared "who is open" signal exists — which is this store again. Native was never
 * even reached: it clips to the list's own viewport too (batch 50).
 *
 * Mounting outside every list costs one component and this store, and both are
 * needed regardless: the add-to-playlist sheet and the delete confirm are modal, so
 * they live at the root either way.
 *
 * Which is also why the *anchor* travels with the song: the menu is a popover on
 * the row's `⋯`, but only the row can measure that button, and by the time the
 * menu renders it is in a different subtree entirely.
 *
 * The sheet is keyed by song *ids*, not a song object, because the library's
 * multi-select dispatches through here too — it is the same sheet, not a second
 * flatter one inlined into the page.
 *
 * The overlays are mutually exclusive: opening one closes the others, so
 * the back-stack never has to order them against each other. The info and
 * edit dialogs follow the same rule — the info dialog's edit button opens the
 * edit dialog by switching the one slot (info closes, edit opens), so the
 * back-stack never sees both at once either.
 */
export const useSongRowOverlays = create<SongRowOverlayState>((set) => ({
  menuSong: null,
  menuAnchor: null,
  addToPlaylistSongIds: [],
  addToPlaylistOnAdded: null,
  deleteSong: null,
  infoSong: null,
  editSong: null,
  openMenu: (song, anchor) =>
    set({
      menuSong: song,
      menuAnchor: anchor ?? null,
      addToPlaylistSongIds: [],
      addToPlaylistOnAdded: null,
      deleteSong: null,
      infoSong: null,
      editSong: null,
    }),
  closeMenu: () => set({ menuSong: null, menuAnchor: null }),
  openAddToPlaylist: ({ songIds, onAdded }) =>
    set({
      addToPlaylistSongIds: songIds,
      addToPlaylistOnAdded: onAdded ?? null,
      menuSong: null,
      menuAnchor: null,
      deleteSong: null,
      infoSong: null,
      editSong: null,
    }),
  closeAddToPlaylist: () => set({ addToPlaylistSongIds: [], addToPlaylistOnAdded: null }),
  requestDelete: (song) =>
    set({
      deleteSong: song,
      menuSong: null,
      menuAnchor: null,
      addToPlaylistSongIds: [],
      addToPlaylistOnAdded: null,
      infoSong: null,
      editSong: null,
    }),
  cancelDelete: () => set({ deleteSong: null }),
  openInfo: (song) =>
    set({
      infoSong: song,
      menuSong: null,
      menuAnchor: null,
      addToPlaylistSongIds: [],
      addToPlaylistOnAdded: null,
      deleteSong: null,
      editSong: null,
    }),
  closeInfo: () => set({ infoSong: null }),
  openEdit: (song) =>
    set({
      editSong: song,
      menuSong: null,
      menuAnchor: null,
      addToPlaylistSongIds: [],
      addToPlaylistOnAdded: null,
      deleteSong: null,
      infoSong: null,
    }),
  closeEdit: () => set({ editSong: null }),
}))

/**
 * Imperative access for non-hook callers (the library's multi-select toolbar,
 * the player's overflow menu).
 */
export const songRowOverlays = {
  openMenu: (song: Song, anchor?: AnchorMeasurement | null) =>
    useSongRowOverlays.getState().openMenu(song, anchor),
  openAddToPlaylist: (params: OpenAddToPlaylistParams) =>
    useSongRowOverlays.getState().openAddToPlaylist(params),
  openInfo: (song: Song) => useSongRowOverlays.getState().openInfo(song),
  openEdit: (song: Song) => useSongRowOverlays.getState().openEdit(song),
}
