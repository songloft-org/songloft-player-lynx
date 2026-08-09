import { create } from 'zustand'

import type { Song } from '../../../models/song.js'
import {
  findCurrentLine,
  parseLrc,
  parsePlain,
  type LyricLine,
} from '../domain/lyric-parser.js'
import { defaultLyricFetcher, type LyricFetcher } from '../data/lyric-source.js'

/**
 * Lyric state store (zustand), mirroring the Flutter `lyricStateProvider`.
 *
 * `loadForSong` fetches + parses the current song's LRC (best-effort — see
 * `lyric-source.ts`); `syncPosition` re-locates the highlighted line as the
 * player position advances. The parsing + line-location are pure functions
 * (`domain/lyric-parser.ts`), so only the async fetch + subscription live here.
 */
export interface LyricState {
  lyrics: LyricLine[]
  /** Highlighted line index, or `-1` (before first line / unsynced). */
  currentIndex: number
  isLoading: boolean
  loadFailed: boolean
  /** `false` for timestamp-less (plain) lyrics — no highlight / auto-scroll. */
  synced: boolean

  loadForSong: (song: Song | undefined, fetcher?: LyricFetcher) => Promise<void>
  /** Parse raw LRC/plain text directly (test + future-cache seam). */
  setLyricsFromText: (text: string) => void
  /** Re-locate the highlighted line for the given player position (ms). */
  syncPosition: (positionMs: number) => void
  clear: () => void
}

const EMPTY = {
  lyrics: [] as LyricLine[],
  currentIndex: -1,
  isLoading: false,
  loadFailed: false,
  synced: true,
}

/** Parse a lyric payload's plain `lyric` field into lines + a `synced` flag. */
function parseLyricText(text: string): { lyrics: LyricLine[]; synced: boolean } {
  const trimmed = text.trim()
  if (trimmed.length === 0) return { lyrics: [], synced: true }
  const lyrics = parseLrc(text)
  if (lyrics.length > 0) return { lyrics, synced: true }
  // No timestamps but non-empty → static plain lyrics.
  return { lyrics: parsePlain(text), synced: false }
}

export const useLyricStore = create<LyricState>((set, get) => {
  // Guards against a slow fetch for a previous song overwriting a newer one.
  let loadToken = 0

  return {
    ...EMPTY,

    loadForSong: async (song, fetcher = defaultLyricFetcher) => {
      const token = ++loadToken
      if (!song || !song.lyricUrl) {
        set({ ...EMPTY })
        return
      }
      set({ ...EMPTY, isLoading: true })
      try {
        const payload = await fetcher(song)
        if (token !== loadToken) return // superseded by a newer load
        const { lyrics, synced } = parseLyricText(payload.lyric ?? '')
        set({ lyrics, synced, currentIndex: -1, isLoading: false, loadFailed: false })
      } catch {
        if (token !== loadToken) return
        set({ ...EMPTY, loadFailed: true })
      }
    },

    setLyricsFromText: (text) => {
      loadToken++ // cancel any in-flight fetch
      const { lyrics, synced } = parseLyricText(text)
      set({ lyrics, synced, currentIndex: -1, isLoading: false, loadFailed: false })
    },

    syncPosition: (positionMs) => {
      const { lyrics, synced, currentIndex } = get()
      if (!synced || lyrics.length === 0) return
      const next = findCurrentLine(lyrics, positionMs)
      if (next !== currentIndex) set({ currentIndex: next })
    },

    clear: () => {
      loadToken++
      set({ ...EMPTY })
    },
  }
})
