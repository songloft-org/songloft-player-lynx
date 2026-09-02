import { create } from 'zustand'

import { logInfo, logWarn } from '../../../core/logging/client-logger.js'
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
  notificationLyricInTitle: boolean

  loadForSong: (
    song: Song | undefined,
    fetcher?: LyricFetcher,
    opts?: { forceRefresh?: boolean },
  ) => Promise<void>
  refetch: (song: Song | undefined) => Promise<void>
  setLyricsFromText: (text: string) => void
  setRawLyric: (text: string) => void
  syncPosition: (positionMs: number) => void
  setNotificationLyricInTitle: (inTitle: boolean) => void
  clear: () => void
}

const EMPTY_MAP = new Map<number, string>()

/** Keep per-line log entries one line long. */
function truncLog(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length <= 40 ? flat : `${flat.slice(0, 40)}...`
}

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
  notificationLyricInTitle: true,
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
  let prefLoaded = false

  return {
    ...EMPTY,

    loadForSong: async (song, fetcher = defaultLyricFetcher, opts) => {
      if (!prefLoaded) {
        prefLoaded = true
        void import('../../settings/data/settings-prefs.js')
          .then((m) => m.readNotificationLyricInTitle())
          .then((v) => set({ notificationLyricInTitle: v }))
          .catch(() => {})
      }
      const token = ++loadToken
      if (!song || !song.lyricUrl) {
        // Distinguishing "never had a url" from "load failed" is the first
        // fork in the notification-lyric chain: no url here means the store
        // clears and nothing downstream (syncPosition → notif) ever fires.
        logInfo('lyric', `no lyric url (song=${song?.id ?? 'none'}); lyrics cleared`)
        set({ ...EMPTY })
        return
      }
      logInfo('lyric', `loading song=${song.id}${opts?.forceRefresh ? ' (refresh)' : ''}`)
      set({ ...EMPTY, isLoading: true })
      try {
        // forceRefresh skips the local cache and tells the backend to re-run its
        // lyric search plugins (see `LyricFetchOptions.refresh`).
        const cached = opts?.forceRefresh ? null : await getCachedLyric(song.id)
        if (token !== loadToken) return

        let payload: { lyric?: string; tlyric?: string; rlyric?: string; lxlyric?: string }

        if (cached) {
          payload = cached
          logInfo('lyric', `cache hit song=${song.id}`)
        } else {
          payload = await fetcher(song, { refresh: opts?.forceRefresh })
          if (token !== loadToken) return
          logInfo('lyric', `fetched song=${song.id} bytes=${(payload.lyric ?? '').length}`)
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
        logInfo(
          'lyric',
          `loaded song=${song.id} lines=${lyrics.length} synced=${synced} translation=${hasTranslation}`,
        )
      } catch (e) {
        if (token !== loadToken) return
        // The failure was swallowed silently before: an exported log showed a
        // healthy app while the lyric store sat in loadFailed forever.
        logWarn('lyric', `load failed song=${song.id}: ${e instanceof Error ? e.message : String(e)}`)
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
      const { lyrics, synced, currentIndex, notificationLyricInTitle } = get()
      if (!synced || lyrics.length === 0) return
      const next = findCurrentLine(lyrics, positionMs)
      if (next !== currentIndex) {
        set({ currentIndex: next })
        const line = lyrics[next]
        const text = line?.text ?? null
        logInfo('lyric', `line ${next}/${lyrics.length}: ${text ? truncLog(text) : '(gap)'}`)
        if (text) {
          void getFloatingLyricModule().updateLyric(text, lyrics[next + 1]?.text ?? '')
        }
        void getAudio().updateNotificationLyric(text, notificationLyricInTitle)
      }
    },

    setNotificationLyricInTitle: (inTitle) => {
      set({ notificationLyricInTitle: inTitle })
      const { lyrics, currentIndex } = get()
      const text = currentIndex >= 0 && currentIndex < lyrics.length
        ? lyrics[currentIndex]?.text ?? null
        : null
      if (text) {
        void getAudio().updateNotificationLyric(text, inTitle)
      }
    },

    clear: () => {
      loadToken++
      set({ ...EMPTY })
    },
  }
})
