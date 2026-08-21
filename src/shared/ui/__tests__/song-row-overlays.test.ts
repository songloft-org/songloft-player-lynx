import { beforeEach, expect, test } from 'vitest'

import type { Song } from '../../../models/song.js'
import { useSongRowOverlays } from '../song-row-overlays.js'

/*
 * The song-row overlay store, at the getState() level — no React involved, so
 * the ReactLynx-vs-zustand hook conflict never comes up. What is pinned here:
 * the three overlays are mutually exclusive (so the back-stack never has to
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
})

test('openMenu records the song, clearing the other two overlays', () => {
  const song = makeSong(1)
  useSongRowOverlays.getState().requestDelete(song)
  useSongRowOverlays.getState().openAddToPlaylist(song)
  useSongRowOverlays.getState().openMenu(song)

  const s = useSongRowOverlays.getState()
  expect(s.menuSong).toBe(song)
  expect(s.addToPlaylistSong).toBeNull()
  expect(s.deleteSong).toBeNull()
})

test('openAddToPlaylist records the song, closing the menu it was chosen from', () => {
  const song = makeSong(2)
  useSongRowOverlays.getState().openMenu(song)
  useSongRowOverlays.getState().openAddToPlaylist(song)

  const s = useSongRowOverlays.getState()
  expect(s.addToPlaylistSong).toBe(song)
  expect(s.menuSong).toBeNull()
  expect(s.deleteSong).toBeNull()
})

test('requestDelete records the song, closing an open menu', () => {
  const song = makeSong(3)
  useSongRowOverlays.getState().openMenu(song)
  useSongRowOverlays.getState().requestDelete(song)

  const s = useSongRowOverlays.getState()
  expect(s.deleteSong).toBe(song)
  expect(s.menuSong).toBeNull()
  expect(s.addToPlaylistSong).toBeNull()
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

  useSongRowOverlays.getState().openAddToPlaylist(song)
  useSongRowOverlays.getState().closeMenu()
  expect(useSongRowOverlays.getState().addToPlaylistSong).toBe(song)
  useSongRowOverlays.getState().closeAddToPlaylist()
  expect(useSongRowOverlays.getState().addToPlaylistSong).toBeNull()
})
