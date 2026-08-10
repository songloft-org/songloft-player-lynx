import { create } from 'zustand'

import type { Song } from '../../../models/song.js'
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

  loadForSong: (song: Song | undefined, fetcher?: LyricFetcher) => Promise<void>
  setLyricsFromText: (text: string) => void
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

    loadForSong: async (song, fetcher = defaultLyricFetcher) => {
      const token = ++loadToken
      if (!song || !song.lyricUrl) {
        set({ ...EMPTY })
        return
      }
      set({ ...EMPTY, isLoading: true })
      try {
        const payload = await fetcher(song)
        if (token !== loadToken) return
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
      })
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
