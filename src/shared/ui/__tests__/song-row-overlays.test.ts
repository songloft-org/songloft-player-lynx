import { beforeEach, expect, test } from 'vitest'

import type { Song } from '../../../models/song.js'
import { useSongRowOverlays } from '../song-row-overlays.js'

/*
 * The song-row overlay store, at the getState() level — no React involved, so
 * the ReactLynx-vs-zustand hook conflict never comes up. What is pinned here:
 * the five overlays are mutually exclusive (so the back-stack never has to
 * order them against each other) and each close action clears only its own.
 */

function makeSong(id: number): Song {
  return {
    id,
    type: 'local',
    title: 'Blue in Green',
    artist: 'Miles Davis',
    album: '',
    year: 0,
    genre: undefined,
    language: undefined,
    style: undefined,
    duration: 327,
    filePath: undefined,
    url: undefined,
    coverUrl: undefined,
    lyricUrl: undefined,
    lyricRemoteUrl: undefined,
    fileSize: 0,
    format: undefined,
    bitRate: 0,
    sampleRate: 0,
    sourceUrl: undefined,
    sourceCoverUrl: undefined,
    isLive: false,
    isVideo: false,
    addedAt: '',
    updatedAt: '',
  }
}

beforeEach(() => {
  const s = useSongRowOverlays.getState()
  s.closeMenu()
  s.closeAddToPlaylist()
  s.cancelDelete()
  s.closeInfo()
  s.closeEdit()
})

test('openMenu records the song, clearing the other overlays', () => {
  const song = makeSong(1)
  useSongRowOverlays.getState().requestDelete(song)
  useSongRowOverlays.getState().openAddToPlaylist({ songIds: [song.id] })
  useSongRowOverlays.getState().openMenu(song)

  const s = useSongRowOverlays.getState()
  expect(s.menuSong).toBe(song)
  expect(s.addToPlaylistSongIds).toEqual([])
  expect(s.deleteSong).toBeNull()
  expect(s.infoSong).toBeNull()
  expect(s.editSong).toBeNull()
})

test('openAddToPlaylist records the ids, closing the menu it was chosen from', () => {
  const song = makeSong(2)
  useSongRowOverlays.getState().openMenu(song)
  useSongRowOverlays.getState().openAddToPlaylist({ songIds: [song.id] })

  const s = useSongRowOverlays.getState()
  expect(s.addToPlaylistSongIds).toEqual([2])
  expect(s.menuSong).toBeNull()
  expect(s.deleteSong).toBeNull()
})

/*
 * A whole selection is the library multi-select's case: the same sheet, opened
 * with every selected id plus the callback that lets it leave select mode only
 * once the add actually succeeded.
 */
test('openAddToPlaylist takes a whole selection and its success callback', () => {
  const onAdded = () => {}
  useSongRowOverlays.getState().openAddToPlaylist({ songIds: [4, 5, 6], onAdded })

  const s = useSongRowOverlays.getState()
  expect(s.addToPlaylistSongIds).toEqual([4, 5, 6])
  expect(s.addToPlaylistOnAdded).toBe(onAdded)
})

test('closeAddToPlaylist drops the callback with the ids', () => {
  useSongRowOverlays.getState().openAddToPlaylist({ songIds: [7], onAdded: () => {} })
  useSongRowOverlays.getState().closeAddToPlaylist()

  const s = useSongRowOverlays.getState()
  expect(s.addToPlaylistSongIds).toEqual([])
  expect(s.addToPlaylistOnAdded).toBeNull()
})

test('requestDelete records the song, closing an open menu', () => {
  const song = makeSong(3)
  useSongRowOverlays.getState().openMenu(song)
  useSongRowOverlays.getState().requestDelete(song)

  const s = useSongRowOverlays.getState()
  expect(s.deleteSong).toBe(song)
  expect(s.menuSong).toBeNull()
  expect(s.addToPlaylistSongIds).toEqual([])
})

/*
 * The info dialog's edit button switches to the edit dialog through this store
 * (openEdit from inside SongInfoDialog's onEdit), so "info closes, edit opens"
 * must hold exactly — the back-stack would otherwise see both dialogs at once.
 */
test('openInfo records the song, clearing every other overlay', () => {
  const song = makeSong(5)
  const other = makeSong(6)
  useSongRowOverlays.getState().openMenu(song)
  useSongRowOverlays.getState().openAddToPlaylist({ songIds: [song.id] })
  useSongRowOverlays.getState().requestDelete(song)
  useSongRowOverlays.getState().openEdit(other)
  useSongRowOverlays.getState().openInfo(song)

  const s = useSongRowOverlays.getState()
  expect(s.infoSong).toBe(song)
  expect(s.menuSong).toBeNull()
  expect(s.addToPlaylistSongIds).toEqual([])
  expect(s.deleteSong).toBeNull()
  expect(s.editSong).toBeNull()
})

test('openEdit records the song, switching the info slot rather than stacking', () => {
  const song = makeSong(7)
  useSongRowOverlays.getState().openInfo(song)
  useSongRowOverlays.getState().openEdit(song)

  const s = useSongRowOverlays.getState()
  expect(s.editSong).toBe(song)
  expect(s.infoSong).toBeNull()
  expect(s.menuSong).toBeNull()
  expect(s.deleteSong).toBeNull()
})

test('closing the info dialog leaves an open edit dialog alone (and vice versa)', () => {
  const song = makeSong(8)
  useSongRowOverlays.getState().openEdit(song)
  useSongRowOverlays.getState().closeInfo()
  expect(useSongRowOverlays.getState().editSong).toBe(song)

  useSongRowOverlays.getState().openInfo(song)
  useSongRowOverlays.getState().closeEdit()
  expect(useSongRowOverlays.getState().infoSong).toBe(song)
})

test('each close action clears only its own overlay', () => {
  const song = makeSong(4)

  // Menu + delete cannot be set at once (see above), so drive one pair at a
  // time and prove the unrelated close is inert.
  useSongRowOverlays.getState().requestDelete(song)
  useSongRowOverlays.getState().closeMenu()
  expect(useSongRowOverlays.getState().deleteSong).toBe(song)
  useSongRowOverlays.getState().closeAddToPlaylist()
  expect(useSongRowOverlays.getState().deleteSong).toBe(song)

  useSongRowOverlays.getState().cancelDelete()
  expect(useSongRowOverlays.getState().deleteSong).toBeNull()

  useSongRowOverlays.getState().openAddToPlaylist({ songIds: [song.id] })
  useSongRowOverlays.getState().closeMenu()
  expect(useSongRowOverlays.getState().addToPlaylistSongIds).toEqual([4])
  useSongRowOverlays.getState().closeAddToPlaylist()
  expect(useSongRowOverlays.getState().addToPlaylistSongIds).toEqual([])
})
