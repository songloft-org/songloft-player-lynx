import { create } from 'zustand'

import { apiPrefix } from '../../../core/config/app-config.js'
import type { Song } from '../../../models/song.js'
import { getAudio } from '../../../native/audio-facade.js'
import { getFloatingLyricModule } from '../../../native/floating-lyric.js'
import {
  findCurrentLine,
  mergeTranslations,
  parseEnhancedLrc,
  parseLrc,
  parsePlain,
  parseTranslation,
  type LyricLine,
} from '../domain/lyric-parser.js'
import { defaultLyricFetcher, type LyricFetcher } from '../data/lyric-source.js'
import { cacheLyric, getCachedLyric, removeCachedLyric } from '../data/lyric-cache.js'

export interface LyricState {
  lyrics: LyricLine[]
  currentIndex: number
  isLoading: boolean
  loadFailed: boolean
  synced: boolean
  translationMap: Map<number, string>
  romanizationMap: Map<number, string>
  hasTranslation: boolean
  hasRomanization: boolean
  rawLyric: string | null

  loadForSong: (
    song: Song | undefined,
    fetcher?: LyricFetcher,
    opts?: { forceRefresh?: boolean },
  ) => Promise<void>
  refetch: (song: Song | undefined) => Promise<void>
  setLyricsFromText: (text: string) => void
  setRawLyric: (text: string) => void
  syncPosition: (positionMs: number) => void
  clear: () => void
}

const EMPTY_MAP = new Map<number, string>()

const EMPTY = {
  lyrics: [] as LyricLine[],
  currentIndex: -1,
  isLoading: false,
  loadFailed: false,
  synced: true,
  translationMap: EMPTY_MAP,
  romanizationMap: EMPTY_MAP,
  hasTranslation: false,
  hasRomanization: false,
  rawLyric: null as string | null,
}

function parseLyricText(text: string, enhanced?: string): { lyrics: LyricLine[]; synced: boolean } {
  const trimmed = (enhanced ?? text).trim()
  if (trimmed.length === 0) return { lyrics: [], synced: true }

  if (enhanced && enhanced.trim().length > 0) {
    const lyrics = parseEnhancedLrc(enhanced)
    if (lyrics.length > 0) return { lyrics, synced: true }
  }

  const lyrics = parseLrc(text)
  if (lyrics.length > 0) return { lyrics, synced: true }
  return { lyrics: parsePlain(text), synced: false }
}

export const useLyricStore = create<LyricState>((set, get) => {
  let loadToken = 0

  return {
    ...EMPTY,

    loadForSong: async (song, fetcher = defaultLyricFetcher, opts) => {
      const token = ++loadToken
      if (!song || !song.lyricUrl) {
        set({ ...EMPTY })
        return
      }
      set({ ...EMPTY, isLoading: true })
      try {
        // forceRefresh skips the local cache and tells the backend to re-run its
        // lyric search plugins (see `LyricFetchOptions.refresh`).
        const cached = opts?.forceRefresh ? null : await getCachedLyric(song.id)
        if (token !== loadToken) return

        let payload: { lyric?: string; tlyric?: string; rlyric?: string; lxlyric?: string }

        if (cached) {
          payload = cached
        } else {
          payload = await fetcher(song, { refresh: opts?.forceRefresh })
          if (token !== loadToken) return
          cacheLyric(song.id, {
            lyric: payload.lyric,
            tlyric: payload.tlyric,
            rlyric: payload.rlyric,
            lxlyric: payload.lxlyric,
            cachedAt: Date.now(),
          })
        }

        const { lyrics, synced } = parseLyricText(payload.lyric ?? '', payload.lxlyric)
        let translationMap = EMPTY_MAP
        let romanizationMap = EMPTY_MAP
        let hasTranslation = false
        let hasRomanization = false

        if (payload.tlyric && payload.tlyric.trim().length > 0) {
          const tLines = parseTranslation(payload.tlyric)
          if (tLines.length > 0) {
            translationMap = mergeTranslations(lyrics, tLines)
            hasTranslation = translationMap.size > 0
          }
        }

        if (payload.rlyric && payload.rlyric.trim().length > 0) {
          const rLines = parseTranslation(payload.rlyric)
          if (rLines.length > 0) {
            romanizationMap = mergeTranslations(lyrics, rLines)
            hasRomanization = romanizationMap.size > 0
          }
        }

        set({
          lyrics,
          synced,
          currentIndex: -1,
          isLoading: false,
          loadFailed: false,
          translationMap,
          romanizationMap,
          hasTranslation,
          hasRomanization,
          rawLyric: payload.lyric ?? null,
        })
      } catch {
        if (token !== loadToken) return
        set({ ...EMPTY, loadFailed: true })
      }
    },

    setLyricsFromText: (text) => {
      loadToken++
      const { lyrics, synced } = parseLyricText(text)
      set({
        lyrics,
        synced,
        currentIndex: -1,
        isLoading: false,
        loadFailed: false,
        translationMap: EMPTY_MAP,
        romanizationMap: EMPTY_MAP,
        hasTranslation: false,
        hasRomanization: false,
        rawLyric: text,
      })
    },

    setRawLyric: (text) => {
      const { lyrics, synced } = parseLyricText(text)
      set({ rawLyric: text, lyrics, synced, currentIndex: -1 })
    },

    /**
     * User-triggered forced re-fetch of the current song's lyrics: evict the
     * local cache, then reload straight from the backend with the refresh flag
     * set (it re-runs the lyric search plugins and replies `no-store`). A local
     * song without a lyric URL gets the endpoint assembled from its id —
     * refreshing is how a local song with no lyrics yet gets its first ones.
     */
    refetch: async (song) => {
      if (!song) return
      let lyricUrl = song.lyricUrl
      if (!lyricUrl && song.type === 'local') {
        lyricUrl = `${apiPrefix}/songs/${song.id}/lyric`
      }
      if (!lyricUrl) return
      await removeCachedLyric(song.id)
      await get().loadForSong({ ...song, lyricUrl }, undefined, { forceRefresh: true })
    },

    syncPosition: (positionMs) => {
      const { lyrics, synced, currentIndex } = get()
      if (!synced || lyrics.length === 0) return
      const next = findCurrentLine(lyrics, positionMs)
      if (next !== currentIndex) {
        set({ currentIndex: next })
        const line = lyrics[next]
        const text = line?.text ?? null
        if (text) {
          void getFloatingLyricModule().updateLyric(text)
        }
        void getAudio().updateNotificationLyric(text)
      }
    },

    clear: () => {
      loadToken++
      set({ ...EMPTY })
    },
  }
})
