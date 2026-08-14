import { create } from 'zustand'

import { buildCoverUrl, buildSongUrl } from '../../../core/network/url-helper.js'
import { readAudioQuality, readAutoResume, readNormalize, readPlaybackSpeed, writePlaybackSpeed } from '../../settings/data/settings-prefs.js'
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

let _normalize = false
readNormalize().then((v) => { _normalize = v }).catch(() => {})

export function setNormalizeEnabled(enabled: boolean): void {
  _normalize = enabled
}

export function isNormalizeEnabled(): boolean {
  return _normalize
}

function songUrl(song: Song): string {
  if (!song.url) return ''
  return buildSongUrl(song.url, { songFormat: song.format, quality: _audioQuality, normalize: _normalize })
}

/**
 * Cover URL for the native media notification, or `undefined` when there is
 * nothing to show. Must be the same fully-resolved form the UI uses
 * (`buildCoverUrl` adds the base URL and the `access_token` the cover endpoint
 * requires) — the native side only does `Uri.parse` on it, no auth of its own.
 */
function artworkUrlOf(song: Song): string | undefined {
  if (!song.coverUrl) return undefined
  return buildCoverUrl(song.coverUrl, song.updatedAt) || undefined
}

function toAudioItem(song: Song): AudioItem {
  return {
    id: song.id,
    url: songUrl(song),
    durationMs: durationMsOf(song),
    title: song.title,
    artist: song.artist,
    artworkUrl: artworkUrlOf(song),
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

/* ------------------------------------------------------ playback error retry */

/**
 * Exponential backoff for a failed load/stream. A remote song behind a flaky
 * gateway (a 502, a dropped connection mid-stream) used to just stop dead.
 *
 * Three deliberate choices, each of which the obvious implementation gets wrong:
 *
 * 1. **The budget resets per song, not on every successful `playing` state.**
 *    Resetting on success reads more natural but lets a *flapping* stream (plays
 *    a second, drops, plays a second, drops) retry forever and hammer the
 *    server. Bound to the song instead: at most three attempts per song, until
 *    the user's next explicit action moves playback somewhere new.
 * 2. **The retry deliberately bypasses `playAtIndex`.** That action calls
 *    `cancelRetry()` — it represents fresh user intent — so routing a retry
 *    through it would zero the counter on every attempt and never terminate.
 * 3. **It re-seeks to where the failure happened.** A mid-stream drop at 2:30
 *    that silently restarts the track from 0 is worse than not retrying at all.
 */
const RETRY_DELAYS_MS = [1_000, 3_000, 9_000]
let _retryCount = 0
// Guarded `clearTimeout` rather than `safeClearTimeout`: this handle is a
// `setTimeout` return value (a `Timeout` under the Node typings), matching how
// `_saveTimer` below is handled. Lynx's strict `clearTimeout` still never sees a
// nullish argument, which is the crash the helper exists to prevent.
let _retryTimer: ReturnType<typeof setTimeout> | null = null
let _retrySongId: number | null = null

/**
 * Id of the song currently loaded into the audio engine, or null if the engine
 * holds nothing. This is engine state, not store state — they diverge whenever
 * the store is restored from disk without loading audio (auto-resume off), which
 * is exactly the case `togglePlay` has to detect.
 */
let _loadedSongId: number | null = null

/** Test hook: forget what the engine holds (each scenario starts cold). */
export function resetLoadedSongForTests(): void {
  _loadedSongId = null
}

function clearRetryTimer(): void {
  if (_retryTimer != null) clearTimeout(_retryTimer)
  _retryTimer = null
}

/** Drop any pending retry and restore the full budget (new user intent). */
function cancelRetry(): void {
  clearRetryTimer()
  _retryCount = 0
  _retrySongId = null
}

function scheduleRetry(song: Song, positionMs: number): void {
  if (_retrySongId !== song.id) {
    _retryCount = 0
    _retrySongId = song.id
  }
  const delay = RETRY_DELAYS_MS[_retryCount]
  // Budget exhausted — leave `errorMessage` standing rather than retrying forever.
  if (delay === undefined) return
  _retryCount += 1

  clearRetryTimer()
  _retryTimer = setTimeout(() => {
    _retryTimer = null
    // The user may have skipped, stopped, or picked another song while we waited;
    // reloading here would yank playback back to a track they left behind.
    if (usePlayerStore.getState().currentSong?.id !== song.id) return
    usePlayerStore.setState({ errorMessage: undefined, isBuffering: true })
    void audio.load(songUrl(song), { durationMs: durationMsOf(song) })
      .then(() => (positionMs > 0 ? audio.seek(positionMs) : undefined))
      .then(() => audio.play())
      // A failure here re-emits `error`, which schedules the next attempt; there
      // is nothing to do with the rejection itself.
      .catch(() => {})
  }, delay)
}

export const usePlayerStore = create<PlayerState>((set, get) => {
  /** Load + play the song at `index` (index/currentSong already computable). */
  async function playAtIndex(index: number): Promise<void> {
    const song = get().playlist[index]
    if (!song) return
    cancelRetry()
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
    _loadedSongId = song.id
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

    /**
     * `audio.play()` alone is not enough to start playback: the native engine
     * needs a media item first, and after a cold start with auto-resume OFF (the
     * default) the store has a `currentSong` that was never handed to the engine
     * — `restorePlaybackState` only writes state in that case. ExoPlayer and
     * AVPlayer both treat `play()` with no item as a silent no-op, so the mini
     * player's play button did nothing at all, not even flip its icon.
     *
     * The mock audio hides this (its `play()` starts ticking without a `load()`),
     * which is why no test caught it. `_loadedSongId` tracks what the engine
     * actually holds so we can load on demand.
     */
    togglePlay: async () => {
      const s = get()
      if (!s.currentSong) return
      if (s.isPlaying) {
        await audio.pause()
        return
      }
      if (_loadedSongId !== s.currentSong.id) {
        await playAtIndex(s.currentIndex >= 0 ? s.currentIndex : 0)
        return
      }
      await audio.play()
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
      cancelRetry()
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
  const { currentSong, currentTime } = usePlayerStore.getState()
  usePlayerStore.setState({ isPlaying: false, isBuffering: false, errorMessage: e.message })
  // Retry transparently; `scheduleRetry` is a no-op once the song's budget is spent,
  // so the error state above is what the user is left with after the last attempt.
  if (currentSong) scheduleRetry(currentSong, currentTime)
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
/** Persist at most one position write per this many ms of playback. */
const SAVE_POSITION_STEP_MS = 10_000

/**
 * Mirror the queue and playback position to storage so a cold start can resume.
 *
 * The position trigger used to be `|currentTime - prev.currentTime| > 5000`,
 * which **never fires during playback**: progress arrives every 250ms (mock/web)
 * or 500ms (Android), so consecutive deltas are two orders of magnitude too
 * small. The only jumps big enough were track changes resetting to 0 — so the
 * value on disk was reliably 0 and "resume playback" always restarted the song.
 *
 * Compare bucket indices instead: a write happens once per
 * `SAVE_POSITION_STEP_MS` of progress regardless of tick size, and seeks land in
 * a new bucket immediately.
 */
usePlayerStore.subscribe((state, prev) => {
  const queueChanged = state.playlist !== prev.playlist || state.currentIndex !== prev.currentIndex
  const bucket = Math.floor(state.currentTime / SAVE_POSITION_STEP_MS)
  const prevBucket = Math.floor(prev.currentTime / SAVE_POSITION_STEP_MS)
  if (!queueChanged && bucket === prevBucket) return
  if (_saveTimer != null) clearTimeout(_saveTimer)
  _saveTimer = setTimeout(() => {
    _saveTimer = null
    // Read through the store rather than the captured `state`: this fires up to
    // SAVE_DEBOUNCE_MS later, and the snapshot that scheduled it is stale by then
    // (a debounced write would otherwise persist a position 2s behind reality,
    // or a queue the user has since changed).
    const s = usePlayerStore.getState()
    void savePlaybackState(s.playlist, s.currentIndex, s.currentTime, s.sourcePlaylistId)
  }, SAVE_DEBOUNCE_MS)
})

// Live Activity integration: update iOS lock screen widget on song/state change
import { getLiveActivityModule } from '../../../native/live-activity.js'

let _liveActivityId: string | null = null
/** True while a `start()` is in flight — see the dedup notes below. */
let _liveActivityStarting = false
/** Set once `start()` has answered with an empty id: the feature is off. */
let _liveActivityUnavailable = false

/**
 * Mirror the now-playing song to the iOS lock-screen Live Activity.
 *
 * Two dedup hazards, both caused by treating `_liveActivityId` as the only state:
 *
 * 1. **`start()` is async.** Two rapid song changes (auto-advance immediately
 *    followed by a manual "next") both observe `_liveActivityId === null` and
 *    both call `Activity.request`. The second overwrites native's
 *    `currentActivity`, so the first is never `end()`ed and lingers on the lock
 *    screen until iOS times it out. Hence `_liveActivityStarting`.
 * 2. **Failure returns `''`, which is falsy.** When the user has Live Activities
 *    switched off (or the first request is denied in background), every later
 *    song/state change re-entered the `start()` branch, so it retried forever and
 *    never reached `update()`. An empty answer now latches the feature off.
 */
usePlayerStore.subscribe((state, prev) => {
  const songChanged = state.currentSong !== prev.currentSong
  const playStateChanged = state.isPlaying !== prev.isPlaying
  if (!songChanged && !playStateChanged) return
  if (_liveActivityUnavailable) return
  const la = getLiveActivityModule()
  const song = state.currentSong
  if (!song) {
    if (_liveActivityId) {
      void la.end(_liveActivityId)
      _liveActivityId = null
    }
    return
  }
  if (_liveActivityId) {
    void la.update(_liveActivityId, song.title, song.artist ?? '', state.isPlaying)
    return
  }
  if (_liveActivityStarting) return
  _liveActivityStarting = true
  void la
    .start(song.title, song.artist ?? '')
    .then((id) => {
      if (id) _liveActivityId = id
      // An empty id means the host refused; stop asking on every track change.
      else _liveActivityUnavailable = true
    })
    .catch(() => {
      _liveActivityUnavailable = true
    })
    .then(() => {
      _liveActivityStarting = false
    })
})

/** Test hook: forget Live Activity bookkeeping between scenarios. */
export function resetLiveActivityForTests(): void {
  _liveActivityId = null
  _liveActivityStarting = false
  _liveActivityUnavailable = false
}



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
    // Use the shared `toAudioItem`/`durationMsOf` rather than re-inlining the
    // mapping: this path used to carry its own copy, which silently omitted any
    // field added to the queue item (it missed `artworkUrl` on arrival).
    void audio.setQueue(saved.playlist.map(toAudioItem), saved.currentIndex)
    void audio.load(songUrl(song), { durationMs: durationMsOf(song) })
      .then(() => audio.seek(saved.positionMs))
      .then(() => audio.play())
  }
}
