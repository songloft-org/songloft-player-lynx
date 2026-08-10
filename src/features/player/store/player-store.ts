import { create } from 'zustand'

import { buildSongUrl } from '../../../core/network/url-helper.js'
import type { Song } from '../../../models/song.js'
import {
  DEFAULT_DURATION_MS,
  getAudio,
  safeClearInterval,
  type AudioItem,
} from '../../../native/index.js'
import { cyclePlayMode, resolveNext, resolvePrev, type PlayMode } from '../domain/play-mode.js'
import { moveItem, removeAt } from '../domain/queue.js'
import {
  sleepTimerAfterSongs,
  sleepTimerByDuration,
  sleepTimerOnSongCompleted,
  tickSleepTimer,
  type SleepTimerStatus,
} from '../domain/sleep-timer.js'
import { useLyricStore } from './lyric-store.js'
import type { PlayerData } from './derive.js'

/**
 * Player state store (zustand), bridging the {@link getAudio} mock to the UI —
 * the Lynx analogue of the Flutter `playerStateProvider` + `PlayerNotifier`.
 *
 * The audio player is the source of truth for `currentTime` / `duration` /
 * `isPlaying` / `isBuffering`: the store subscribes to its events (below) and
 * mirrors them into state, and on `completed` applies play-mode routing. All the
 * decision logic (next/prev index, sleep-timer countdown, queue edits) delegates
 * to the pure functions in `../domain/*` so it is unit-tested without a render.
 */
export interface PlayerState extends PlayerData {
  // ── playback ──
  playSong: (song: Song, queue?: Song[]) => Promise<void>
  playPlaylist: (songs: Song[], startIndex?: number, playlistId?: number) => Promise<void>
  togglePlay: () => Promise<void>
  playNext: () => Promise<void>
  playPrev: () => Promise<void>
  seek: (positionMs: number) => Promise<void>
  seekBy: (deltaMs: number) => Promise<void>

  // ── volume ──
  setVolume: (volume: number) => Promise<void>
  toggleMute: () => Promise<void>

  // ── mode ──
  setPlayMode: (mode: PlayMode) => void
  cyclePlayMode: () => void

  // ── queue edits ──
  addToPlaylist: (songs: Song[]) => void
  removeFromPlaylist: (index: number) => Promise<void>
  reorderPlaylist: (oldIndex: number, newIndex: number) => void
  clearPlaylist: () => void

  // ── ui ──
  toggleFullPlayer: () => void
  closeFullPlayer: () => void
  togglePlaylistDrawer: () => void
  closePlaylistDrawer: () => void
  clearError: () => void

  // ── sleep timer ──
  setSleepTimerByDuration: (durationMs: number) => void
  setSleepTimerAfterSongs: (count: number) => void
  cancelSleepTimer: () => void

  // ── test/reset hook ──
  reset: () => void

  /** Internal: route an audio `completed` event (invoked by the audio bridge). */
  _onCompleted: () => void
}

const audio = getAudio()

/** Countdown interval handle for `duration` sleep timers (module-scoped). */
let sleepIntervalHandle: number | null = null
const SLEEP_TICK_MS = 1_000

const INITIAL: PlayerData = {
  currentSong: undefined,
  playlist: [],
  currentIndex: -1,
  isPlaying: false,
  volume: 50,
  currentTime: 0,
  duration: 0,
  playMode: 'order',
  isBuffering: false,
  showFullPlayer: false,
  showPlaylistDrawer: false,
  sleepTimer: undefined,
  previousVolume: undefined,
  errorMessage: undefined,
  sourcePlaylistId: undefined,
}

function durationMsOf(song: Song): number {
  return song.duration > 0 ? song.duration * 1000 : DEFAULT_DURATION_MS
}

function toAudioItem(song: Song): AudioItem {
  return {
    id: song.id,
    url: song.url ? buildSongUrl(song.url) : '',
    durationMs: durationMsOf(song),
    title: song.title,
    artist: song.artist,
  }
}

export const usePlayerStore = create<PlayerState>((set, get) => {
  /** Load + play the song at `index` (index/currentSong already computable). */
  async function playAtIndex(index: number): Promise<void> {
    const song = get().playlist[index]
    if (!song) return
    set({
      currentIndex: index,
      currentSong: song,
      currentTime: 0,
      errorMessage: undefined,
    })
    void useLyricStore.getState().loadForSong(song)
    await audio.load(song.url ? buildSongUrl(song.url) : '', {
      durationMs: durationMsOf(song),
    })
    await audio.play()
  }

  function stopSleepInterval(): void {
    sleepIntervalHandle = safeClearInterval(sleepIntervalHandle)
  }

  function startSleepInterval(): void {
    stopSleepInterval()
    sleepIntervalHandle = setInterval(() => {
      const step = tickSleepTimer(get().sleepTimer, SLEEP_TICK_MS)
      set({ sleepTimer: step.status })
      if (step.expired) {
        stopSleepInterval()
        void audio.pause()
        set({ isPlaying: false })
      }
    }, SLEEP_TICK_MS) as unknown as number
  }

  /** Route a `completed` event through the current play mode + sleep timer. */
  function onCompleted(): void {
    const s = get()

    // afterSongs sleep timer: decrement first; pause if it expires.
    const step = sleepTimerOnSongCompleted(s.sleepTimer)
    if (step.status !== s.sleepTimer) set({ sleepTimer: step.status })
    if (step.expired) {
      void audio.pause()
      set({ isPlaying: false })
      return
    }

    const nextIdx = resolveNext(s.playMode, s.currentIndex, s.playlist.length)
    if (nextIdx == null) {
      set({ isPlaying: false })
      return
    }
    void playAtIndex(nextIdx)
  }

  return {
    ...INITIAL,

    playSong: async (song, queue) => {
      const current = get()
      let list: Song[]
      if (queue && queue.length > 0) {
        list = queue
      } else {
        const existing = current.playlist.findIndex((s) => s.id === song.id)
        list = existing >= 0 ? current.playlist : [...current.playlist, song]
      }
      const index = Math.max(
        0,
        list.findIndex((s) => s.id === song.id),
      )
      set({ playlist: list, currentIndex: index, currentSong: list[index] })
      void audio.setQueue(list.map(toAudioItem), index)
      await playAtIndex(index)
    },

    playPlaylist: async (songs, startIndex = 0, playlistId) => {
      if (songs.length === 0) return
      const index = Math.min(Math.max(0, startIndex), songs.length - 1)
      set({
        playlist: [...songs],
        currentIndex: index,
        currentSong: songs[index],
        sourcePlaylistId: playlistId,
      })
      void audio.setQueue(songs.map(toAudioItem), index)
      await playAtIndex(index)
    },

    togglePlay: async () => {
      const s = get()
      if (!s.currentSong) return
      if (s.isPlaying) await audio.pause()
      else await audio.play()
    },

    playNext: async () => {
      const s = get()
      if (s.playlist.length === 0) return
      const idx = resolveNext(s.playMode, s.currentIndex, s.playlist.length)
      if (idx == null) return
      await playAtIndex(idx)
    },

    playPrev: async () => {
      const s = get()
      if (s.playlist.length === 0) return
      // > 3s into the track → restart the current track (matches Flutter).
      if (s.currentTime > 3_000) {
        await audio.seek(0)
        return
      }
      const idx = resolvePrev(s.playMode, s.currentIndex, s.playlist.length)
      if (idx == null || idx === s.currentIndex) {
        await audio.seek(0)
        return
      }
      await playAtIndex(idx)
    },

    seek: async (positionMs) => {
      await audio.seek(positionMs)
    },

    seekBy: async (deltaMs) => {
      const s = get()
      if (s.duration <= 0) return
      const target = Math.min(s.duration, Math.max(0, s.currentTime + deltaMs))
      await audio.seek(target)
    },

    setVolume: async (volume) => {
      const clamped = Math.min(100, Math.max(0, Math.round(volume)))
      set({ volume: clamped })
      await audio.setVolume(clamped / 100)
    },

    toggleMute: async () => {
      const s = get()
      if (s.volume === 0) {
        await get().setVolume(s.previousVolume ?? 50)
      } else {
        set({ previousVolume: s.volume })
        await get().setVolume(0)
      }
    },

    setPlayMode: (mode) => set({ playMode: mode }),
    cyclePlayMode: () => set((s) => ({ playMode: cyclePlayMode(s.playMode) })),

    addToPlaylist: (songs) => {
      if (songs.length === 0) return
      const list = [...get().playlist, ...songs]
      set({ playlist: list })
      void audio.setQueue(list.map(toAudioItem), get().currentIndex)
    },

    removeFromPlaylist: async (index) => {
      const s = get()
      const result = removeAt(s.playlist, s.currentIndex, index)
      set({
        playlist: result.playlist,
        currentIndex: result.currentIndex,
        currentSong: result.currentSong,
      })
      if (result.shouldStop) {
        await audio.stop()
        set({ isPlaying: false, currentTime: 0, duration: 0 })
        useLyricStore.getState().clear()
        return
      }
      void audio.setQueue(result.playlist.map(toAudioItem), result.currentIndex)
      if (result.removedCurrent) await playAtIndex(result.currentIndex)
    },

    reorderPlaylist: (oldIndex, newIndex) => {
      const s = get()
      const result = moveItem(s.playlist, s.currentIndex, oldIndex, newIndex)
      set({ playlist: result.playlist, currentIndex: result.currentIndex })
      void audio.setQueue(result.playlist.map(toAudioItem), result.currentIndex)
    },

    clearPlaylist: () => {
      void audio.stop()
      set({
        playlist: [],
        currentIndex: -1,
        currentSong: undefined,
        isPlaying: false,
        currentTime: 0,
        duration: 0,
      })
      useLyricStore.getState().clear()
    },

    toggleFullPlayer: () => set((s) => ({ showFullPlayer: !s.showFullPlayer })),
    closeFullPlayer: () => set({ showFullPlayer: false }),
    togglePlaylistDrawer: () => set((s) => ({ showPlaylistDrawer: !s.showPlaylistDrawer })),
    closePlaylistDrawer: () => set({ showPlaylistDrawer: false }),
    clearError: () => set({ errorMessage: undefined }),

    setSleepTimerByDuration: (durationMs) => {
      const status = sleepTimerByDuration(durationMs)
      set({ sleepTimer: status })
      if (status) startSleepInterval()
      else stopSleepInterval()
    },

    setSleepTimerAfterSongs: (count) => {
      stopSleepInterval() // afterSongs is event-driven, no countdown
      set({ sleepTimer: sleepTimerAfterSongs(count) })
    },

    cancelSleepTimer: () => {
      stopSleepInterval()
      set({ sleepTimer: undefined })
    },

    reset: () => {
      stopSleepInterval()
      void audio.stop()
      set({ ...INITIAL })
      useLyricStore.getState().clear()
    },

    _onCompleted: onCompleted,
  }
})

// ── audio → store bridge ─────────────────────────────────────────────────────
// Subscribe once at module load. The mock emits synchronously; on device the
// native module posts these over the event channel. `completed` drives
// play-mode routing via the store's own actions.
audio.on('progress', (e) => {
  usePlayerStore.setState({ currentTime: e.positionMs, duration: e.durationMs })
  useLyricStore.getState().syncPosition(e.positionMs)
})

audio.on('stateChanged', (e) => {
  switch (e.state) {
    case 'loading':
      usePlayerStore.setState({ isBuffering: true })
      break
    case 'ready':
      usePlayerStore.setState({ isBuffering: false })
      break
    case 'playing':
      usePlayerStore.setState({ isPlaying: true, isBuffering: false })
      break
    case 'paused':
      usePlayerStore.setState({ isPlaying: false })
      break
    case 'idle':
      usePlayerStore.setState({ isPlaying: false, isBuffering: false })
      break
    case 'completed':
      // The completion router (play-mode + sleep-timer) lives in the store
      // initializer because it needs the private `playAtIndex`.
      usePlayerStore.getState()._onCompleted()
      break
    case 'error':
      break
  }
})

audio.on('error', (e) => {
  usePlayerStore.setState({ isPlaying: false, isBuffering: false, errorMessage: e.message })
})
