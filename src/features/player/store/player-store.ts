import { create } from 'zustand'

import {
  buildCoverUrl,
  buildSongUrl,
  buildVideoHlsUrl,
  buildVideoUrl,
} from '../../../core/network/url-helper.js'
import { resolveVideoSourceKind } from '../../../core/network/video-source.js'
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
import { getPlatformTarget } from '../../../native/platform-target.js'
import { getFavoriteState, toggleFavoriteNonReact } from '../../library/data/favorites.js'
import { getPlaylistApi } from '../../playlist/api/index.js'
import { getSongsApi } from '../../library/api/index.js'
import { cyclePlayMode, resolveNext, resolvePrev, type PlayMode } from '../domain/play-mode.js'
import { playlistIdOf, type PlaybackContext } from '../domain/playback-context.js'
import { moveItem, removeAt } from '../domain/queue.js'
import {
  sleepTimerAfterSongs,
  sleepTimerByDuration,
  sleepTimerOnSongCompleted,
  tickSleepTimer,
  type SleepTimerStatus,
} from '../domain/sleep-timer.js'
import { getCachedPath } from '../data/song-cache.js'
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
  playPlaylist: (
    songs: Song[],
    startIndex?: number,
    context?: PlaybackContext,
  ) => Promise<void>
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

  // ── audio track ──
  setAudioTrack: (trackIndex: number | null) => Promise<void>

  // ── sleep timer ──
  setSleepTimerByDuration: (durationMs: number) => void
  setSleepTimerAfterSongs: (count: number) => void
  cancelSleepTimer: () => void

  /**
   * Switch the current song to the server-transcoded HLS video stream.
   *
   * Only meaningful for a video song whose container the device cannot demux; for
   * everything else the stream already carries the picture and this is a no-op. The
   * promise resolves once playback resumes, which may be minutes away — the endpoint
   * transcodes the whole file before answering.
   */
  enterVideoSource: () => Promise<void>

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
  playbackContext: undefined,
  sourcePlaylistId: undefined,
  speed: 1,
}

function durationMsOf(song: Song): number {
  return song.duration > 0 ? song.duration * 1000 : DEFAULT_DURATION_MS
}

/**
 * Duration for the *store* (and therefore the seek bar), where [durationMsOf]'s
 * placeholder fallback would render a total time that is simply wrong. 0 means
 * "unknown" and lets the first host progress event fill it in.
 *
 * Seeding this from the server's metadata is what keeps the total time correct
 * across a track change: the hosts normalise a not-yet-known duration to 0
 * (ExoPlayer's `C.TIME_UNSET`, AVPlayer's `indefinite`), and AVPlayer only resolves
 * the duration of a remote MP3 some way into playback — until then the store would
 * otherwise still be showing the *previous* song's duration.
 */
function stateDurationMsOf(song: Song): number {
  return song.duration > 0 ? song.duration * 1000 : 0
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

/**
 * Playback URL for the native engine.
 *
 * `platform` is not optional in practice: without it `getTranscodeFormat` falls back
 * to `'web'`, the most restrictive format set. On a device that meant two wrong
 * answers at once — `ogg`/`opus` were left untranscoded for AVPlayer, which cannot
 * play them, while every video container was sent `?format=mp3`, which makes the
 * server run `-vn` and drop the picture.
 */
let _audioTrack: number | null = null

function songUrl(song: Song): string {
  if (!song.url) return ''
  return buildSongUrl(song.url, {
    songFormat: song.format,
    quality: _audioQuality,
    normalize: _normalize,
    platform: getPlatformTarget(),
    audioTrack: _audioTrack,
  })
}

/**
 * The song whose picture the user asked for, so the transcoded HLS stream survives
 * a retry.
 *
 * Without it, `RETRY_DELAYS_MS`'s reload would quietly fall back to the audio URL
 * and the video would vanish mid-playback — the kind of regression that looks like a
 * server hiccup.
 */
let _videoSourceSongId: number | null = null

/** What the engine should load, and whether it is a playlist rather than a file. */
interface PlaybackSource {
  url: string
  hls: boolean
}

/**
 * Resolve a song to the stream the engine should open.
 *
 * A video song whose container the device can demux is loaded **as video from the
 * start**, not switched over when the user opens the fullscreen player. That is the
 * whole point of reusing the one player instance: attaching a surface to a stream
 * that already carries a video track is instant and cannot interrupt playback, while
 * swapping the source would cost a reload and a seek. It also costs nothing extra in
 * bytes — with no `format=` the server was already sending the original container,
 * video track included.
 *
 * Containers that need re-encoding are the exception: `/video-hls/` blocks until the
 * whole file is transcoded, so it is only used once the user actually asks
 * ({@link enterVideoSource}), never by default.
 */
function playbackSourceFor(song: Song): PlaybackSource {
  if (!song.url) return { url: '', hls: false }
  const kind = resolveVideoSourceKind(song, getPlatformTarget())
  if (kind === 'direct') return { url: buildVideoUrl(song.url), hls: false }
  if (kind === 'hls' && _videoSourceSongId === song.id) {
    return { url: buildVideoHlsUrl(song.id), hls: true }
  }
  return { url: songUrl(song), hls: false }
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

const QUEUE_WINDOW = 5

function syncQueueWindow(playlist: Song[], index: number): void {
  const start = Math.max(0, index - QUEUE_WINDOW)
  const end = Math.min(playlist.length, index + QUEUE_WINDOW + 1)
  const window = playlist.slice(start, end)
  void audio.setQueue(window.map(toAudioItem), index - start)
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
/** Consecutive songs that failed and were skipped; reset on user action. */
let _consecutiveSkips = 0
const MAX_CONSECUTIVE_SKIPS = 3

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
  _videoSourceSongId = null
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
  _consecutiveSkips = 0
}

function scheduleRetry(song: Song, positionMs: number): void {
  if (_retrySongId !== song.id) {
    _retryCount = 0
    _retrySongId = song.id
  }
  const delay = RETRY_DELAYS_MS[_retryCount]
  // Budget exhausted — skip to the next song instead of freezing the queue.
  // A single bad track (corrupt file, dead URL) used to leave `errorMessage`
  // standing forever with no way forward except manual intervention. Flutter
  // auto-skips up to 3 consecutive failures; we do the same.
  if (delay === undefined) {
    _consecutiveSkips += 1
    if (_consecutiveSkips > MAX_CONSECUTIVE_SKIPS) return
    // Find the next playable index via the same logic as `playNext`.
    const s = usePlayerStore.getState()
    const nextIdx = resolveNext(s.playMode, s.currentIndex, s.playlist.length)
    if (nextIdx != null && nextIdx !== s.currentIndex) {
      void usePlayerStore.getState().playNext()
    }
    return
  }
  _retryCount += 1

  clearRetryTimer()
  _retryTimer = setTimeout(() => {
    _retryTimer = null
    // The user may have skipped, stopped, or picked another song while we waited;
    // reloading here would yank playback back to a track they left behind.
    if (usePlayerStore.getState().currentSong?.id !== song.id) return
    usePlayerStore.setState({ errorMessage: undefined, isBuffering: true })
    const retrySource = playbackSourceFor(song)
    void audio.load(retrySource.url, { durationMs: durationMsOf(song), hls: retrySource.hls })
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
      duration: stateDurationMsOf(song),
      errorMessage: undefined,
    })
    void useLyricStore.getState().loadForSong(song)
    const cached = await getCachedPath(song.id).catch(() => null)
    const source = cached
      ? { url: cached, hls: false }
      : playbackSourceFor(song)
    await audio.load(source.url, {
      durationMs: durationMsOf(song),
      hls: source.hls,
    })
    _loadedSongId = song.id
    await audio.play()
    syncFavoriteToNative(song.id)
    // Report the play event (fire-and-forget). The context decides whether it
    // also lands in play history: without one the backend just broadcasts the
    // event to plugins, which is right for playback that has no stable context.
    // There is no "library" bucket to fall back on — that value is rejected.
    void getSongsApi().recordPlayed(song.id, get().playbackContext).catch(() => {})
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
      // Clears the playback context: a bare single song was not started from a
      // playlist or a facet, so keeping the previous one would record it into
      // whatever the user last played from. A consequence worth keeping in mind
      // — playback started this way is deliberately *not* recorded in any
      // history, which matches the Flutter reference. Do not "fix" that by
      // reinstating a fallback context.
      set({
        playlist: list,
        currentIndex: index,
        currentSong: list[index],
        playbackContext: undefined,
        sourcePlaylistId: undefined,
      })
      syncQueueWindow(list, index)
      await playAtIndex(index)
    },

    playPlaylist: async (songs, startIndex = 0, context) => {
      if (songs.length === 0) return
      const index = Math.min(Math.max(0, startIndex), songs.length - 1)
      const playlistId = playlistIdOf(context)
      set({
        playlist: [...songs],
        currentIndex: index,
        currentSong: songs[index],
        playbackContext: context,
        // Derived, not independent: keeps the Home "now playing" highlight and
        // the `source_playlist_id` plugin contract working unchanged.
        sourcePlaylistId: playlistId,
      })
      syncQueueWindow(songs, index)
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
      syncQueueWindow(list, get().currentIndex)
    },

    insertNextInQueue: (songs) => {
      if (songs.length === 0) return
      const s = get()
      const insertAt = s.currentIndex + 1
      const list = [...s.playlist.slice(0, insertAt), ...songs, ...s.playlist.slice(insertAt)]
      set({ playlist: list })
      syncQueueWindow(list, s.currentIndex)
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
      syncQueueWindow(result.playlist, result.currentIndex)
      if (result.removedCurrent) await playAtIndex(result.currentIndex)
    },

    reorderPlaylist: (oldIndex, newIndex) => {
      const s = get()
      const result = moveItem(s.playlist, s.currentIndex, oldIndex, newIndex)
      set({ playlist: result.playlist, currentIndex: result.currentIndex })
      syncQueueWindow(result.playlist, result.currentIndex)
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

    setAudioTrack: async (trackIndex) => {
      _audioTrack = trackIndex
      const song = get().currentSong
      if (song) {
        const pos = get().currentTime
        const source = playbackSourceFor(song)
        await audio.load(source.url, { hls: source.hls })
        await audio.seek(pos)
        await audio.play()
      }
    },

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

    enterVideoSource: async () => {
      const song = get().currentSong
      if (!song) return
      if (resolveVideoSourceKind(song, getPlatformTarget()) !== 'hls') return
      if (_videoSourceSongId === song.id) return

      _videoSourceSongId = song.id
      const positionMs = get().currentTime
      const source = playbackSourceFor(song)
      set({ errorMessage: undefined, isBuffering: true })
      try {
        // The first request to `/video-hls/` returns only once the server has
        // transcoded the whole file, so this await can take minutes on a weak NAS.
        // Callers show a pending state rather than a progress bar — the endpoint
        // reports nothing until it is done.
        await audio.load(source.url, { durationMs: durationMsOf(song), hls: source.hls })
        _loadedSongId = song.id
        if (positionMs > 0) await audio.seek(positionMs)
        await audio.play()
      } catch (e) {
        // 503 means the server has no ffmpeg, or the transcode failed. Fall back to
        // the audio stream so the user keeps listening instead of losing playback.
        _videoSourceSongId = null
        set({ errorMessage: String(e), isBuffering: false })
      }
    },

    reset: () => {
      stopSleepInterval()
      cancelRetry()
      void audio.stop()
      _videoSourceSongId = null
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
let _prefetchedForIndex: number | null = null

audio.on('progress', (e) => {
  usePlayerStore.setState((s) => ({
    currentTime: e.positionMs,
    duration: e.durationMs > 0 ? e.durationMs : s.duration,
  }))
  useLyricStore.getState().syncPosition(e.positionMs)

  const s = usePlayerStore.getState()
  if (
    s.duration > 0 &&
    e.positionMs > s.duration * 0.8 &&
    _prefetchedForIndex !== s.currentIndex
  ) {
    _prefetchedForIndex = s.currentIndex
    const nextIdx = resolveNext(s.playMode, s.currentIndex, s.playlist.length)
    if (nextIdx != null && s.playlist[nextIdx]) {
      const url = songUrl(s.playlist[nextIdx])
      if (url) void fetch(url, { method: 'HEAD' }).catch(() => {})
    }
  }
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
    void savePlaybackState(s.playlist, s.currentIndex, s.currentTime, s.playbackContext)
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
    duration: stateDurationMsOf(song),
    playbackContext: saved.context,
    sourcePlaylistId: saved.sourcePlaylistId,
  })
  if (autoResume && song.url) {
    // Use the shared `toAudioItem`/`durationMsOf` rather than re-inlining the
    // mapping: this path used to carry its own copy, which silently omitted any
    // field added to the queue item (it missed `artworkUrl` on arrival).
    syncQueueWindow(saved.playlist, saved.currentIndex)
    const restored = playbackSourceFor(song)
    void audio.load(restored.url, { durationMs: durationMsOf(song), hls: restored.hls })
      .then(() => audio.seek(saved.positionMs))
      .then(() => audio.play())
  }
}
