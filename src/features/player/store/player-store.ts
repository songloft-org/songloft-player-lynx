import { create } from 'zustand'

import { buildSongUrl } from '../../../core/network/url-helper.js'
import { readAudioQuality, readAutoResume, readPlaybackSpeed, writePlaybackSpeed } from '../../settings/data/settings-prefs.js'
import { loadPlaybackState, savePlaybackState } from '../data/playback-persistence.js'
import type { Song } from '../../../models/song.js'
import {
  DEFAULT_DURATION_MS,
  getAudio,
  isNativeAudioAvailable,
  safeClearInterval,
  type AudioItem,
} from '../../../native/index.js'
import { readNativeModules } from '../../../native/native-modules.js'
import { getFavoriteState, toggleFavoriteNonReact } from '../../library/data/favorites.js'
import { getPlaylistApi } from '../../playlist/api/index.js'
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
  setSpeed: (rate: number) => Promise<void>

  // ── queue edits ──
  addToPlaylist: (songs: Song[]) => void
  insertNextInQueue: (songs: Song[]) => void
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
  speed: 1,
}

function durationMsOf(song: Song): number {
  return song.duration > 0 ? song.duration * 1000 : DEFAULT_DURATION_MS
}

let _audioQuality: string | null = null
readAudioQuality().then((q) => { _audioQuality = q === 'original' ? null : q }).catch(() => {})

export function setAudioQualityCache(q: string | null): void {
  _audioQuality = q
}

function songUrl(song: Song): string {
  if (!song.url) return ''
  return buildSongUrl(song.url, { songFormat: song.format, quality: _audioQuality })
}

function toAudioItem(song: Song): AudioItem {
  return {
    id: song.id,
    url: songUrl(song),
    durationMs: durationMsOf(song),
    title: song.title,
    artist: song.artist,
  }
}

/**
 * Push the given song's favorite state to the native media notification so its
 * favorite button icon matches. No-op (and zero network) when no native audio
 * module is present — e.g. in tests, or dev in a plain host — since there is no
 * real notification to sync.
 */
function syncFavoriteToNative(songId: number): void {
  if (!isNativeAudioAvailable(readNativeModules())) return
  getFavoriteState(songId)
    .then((isFavorite) => audio.setFavorite(isFavorite))
    .catch(() => {})
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
    await audio.load(songUrl(song), {
      durationMs: durationMsOf(song),
    })
    await audio.play()
    syncFavoriteToNative(song.id)
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
      if (playlistId != null) {
        void getPlaylistApi().touchPlaylist(playlistId).catch(() => {})
      }
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
    setSpeed: async (rate) => {
      const clamped = Math.min(3, Math.max(0.25, rate))
      set({ speed: clamped })
      await audio.setSpeed(clamped)
      void writePlaybackSpeed(clamped)
    },

    addToPlaylist: (songs) => {
      if (songs.length === 0) return
      const list = [...get().playlist, ...songs]
      set({ playlist: list })
      void audio.setQueue(list.map(toAudioItem), get().currentIndex)
    },

    insertNextInQueue: (songs) => {
      if (songs.length === 0) return
      const s = get()
      const insertAt = s.currentIndex + 1
      const list = [...s.playlist.slice(0, insertAt), ...songs, ...s.playlist.slice(insertAt)]
      set({ playlist: list })
      void audio.setQueue(list.map(toAudioItem), s.currentIndex)
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

/**
 * Media-notification remote commands (Android media3 `RemoteCommandForwardingPlayer` /
 * iOS `MPRemoteCommandCenter`, later). `next`/`previous` route through the same
 * play-mode logic as the in-app buttons; `toggleFavorite` goes through the
 * non-React favorites pathway (this runs outside the React tree) and pushes the
 * resulting state back so the notification icon updates.
 */
audio.on('remoteCommand', (e) => {
  switch (e.command) {
    case 'next':
      void usePlayerStore.getState().playNext()
      break
    case 'previous':
      void usePlayerStore.getState().playPrev()
      break
    case 'toggleFavorite': {
      const song = usePlayerStore.getState().currentSong
      if (!song) break
      toggleFavoriteNonReact(song.id)
        .then((isFavorite) => audio.setFavorite(isFavorite))
        .catch(() => {})
      break
    }
  }
})

// ── playback state persistence ───────────────────────────────────────────────
let _saveTimer: ReturnType<typeof setTimeout> | null = null
const SAVE_DEBOUNCE_MS = 2_000

usePlayerStore.subscribe((state, prev) => {
  const queueChanged = state.playlist !== prev.playlist || state.currentIndex !== prev.currentIndex
  const posChanged = Math.abs(state.currentTime - prev.currentTime) > 5_000
  if (!queueChanged && !posChanged) return
  if (_saveTimer != null) clearTimeout(_saveTimer)
  _saveTimer = setTimeout(() => {
    _saveTimer = null
    void savePlaybackState(
      state.playlist,
      state.currentIndex,
      state.currentTime,
      state.sourcePlaylistId,
    )
  }, SAVE_DEBOUNCE_MS)
})

// Live Activity integration: update iOS lock screen widget on song/state change
import { getLiveActivityModule } from '../../../native/live-activity.js'

let _liveActivityId: string | null = null
usePlayerStore.subscribe((state, prev) => {
  const songChanged = state.currentSong !== prev.currentSong
  const playStateChanged = state.isPlaying !== prev.isPlaying
  if (!songChanged && !playStateChanged) return
  const la = getLiveActivityModule()
  const song = state.currentSong
  if (!song) {
    if (_liveActivityId) { void la.end(_liveActivityId); _liveActivityId = null }
    return
  }
  if (!_liveActivityId) {
    void la.start(song.title, song.artist ?? '').then(id => { _liveActivityId = id })
  } else {
    void la.update(_liveActivityId, song.title, song.artist ?? '', state.isPlaying)
  }
})



export async function restorePlaybackState(): Promise<void> {
  const [saved, speed, autoResume] = await Promise.all([
    loadPlaybackState(), readPlaybackSpeed(), readAutoResume(),
  ])
  if (speed !== 1) {
    usePlayerStore.setState({ speed })
    void audio.setSpeed(speed)
  }
  if (!saved || saved.playlist.length === 0) return
  const song = saved.playlist[saved.currentIndex]
  if (!song) return
  usePlayerStore.setState({
    playlist: saved.playlist,
    currentIndex: saved.currentIndex,
    currentSong: song,
    currentTime: saved.positionMs,
    duration: song.duration > 0 ? song.duration * 1000 : 0,
    sourcePlaylistId: saved.sourcePlaylistId,
  })
  if (autoResume && song.url) {
    void audio.setQueue(saved.playlist.map((s) => ({
      id: s.id,
      url: songUrl(s),
      durationMs: s.duration > 0 ? s.duration * 1000 : DEFAULT_DURATION_MS,
      title: s.title,
      artist: s.artist,
    })), saved.currentIndex)
    void audio.load(songUrl(song), { durationMs: song.duration > 0 ? song.duration * 1000 : DEFAULT_DURATION_MS })
      .then(() => audio.seek(saved.positionMs))
      .then(() => audio.play())
  }
}
