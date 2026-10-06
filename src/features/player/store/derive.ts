import type { Song } from '../../../models/song.js'
import type { ScaleMode } from '../../../native/video.js'
import { hasNextForMode, hasPrevForMode, type PlayMode } from '../domain/play-mode.js'
import type { PlaybackContext } from '../domain/playback-context.js'
import type { SleepTimerStatus } from '../domain/sleep-timer.js'

/**
 * Player state **data** shape (no actions), ported from the Flutter
 * `PlayerState`. Times are in **milliseconds**; `volume` is `0..100`. The store
 * (`player-store.ts`) extends this with actions. Derived values are exported as
 * pure selectors so they are trivially unit-testable and re-usable.
 */
export interface PlayerData {
  currentSong?: Song
  playlist: Song[]
  currentIndex: number
  isPlaying: boolean
  /** 0..100 (matches the Flutter volume scale). */
  volume: number
  /** Current playback position in ms. */
  currentTime: number
  /** Track duration in ms. */
  duration: number
  playMode: PlayMode
  isBuffering: boolean
  showFullPlayer: boolean
  showPlaylistDrawer: boolean
  sleepTimer?: SleepTimerStatus
  /** Volume before muting, for restore on unmute. */
  previousVolume?: number
  errorMessage?: string
  /** Where the current queue was started from; drives play-history recording. */
  playbackContext?: PlaybackContext
  /**
   * Playlist ID of {@link playbackContext}, `undefined` for facet contexts.
   * Derived — never set on its own. Kept as a field (rather than a getter) so
   * zustand selectors can subscribe to it, and because JS plugins read it as
   * `source_playlist_id`.
   */
  sourcePlaylistId?: number
  speed: number
  /** Selection belongs only to the current song. null uses the container default. */
  audioTrack?: number | null
  /** undefined = no switch; null = switching back to the default. */
  audioTrackPending?: number | null
  isAudioTrackSwitching?: boolean
  audioTrackError?: string
  /**
   * Aspect-fit vs zoom for the full-screen video surface. `'fit'` letterboxes
   * (the default — landscape video stays landscape inside a portrait screen);
   * `'zoom'` fills the screen and crops. Persisted so a user's choice sticks
   * across sessions.
   */
  videoScaleMode: ScaleMode
}

export function hasSong(s: PlayerData): boolean {
  return s.currentSong != null
}

export function hasNext(s: PlayerData): boolean {
  return hasNextForMode(s.playMode, s.currentIndex, s.playlist.length)
}

export function hasPrev(s: PlayerData): boolean {
  return hasPrevForMode(s.playMode, s.currentIndex, s.playlist.length)
}

/** Playback progress in `[0, 1]` (0 when the duration is unknown). */
export function progressOf(s: PlayerData): number {
  if (s.duration <= 0) return 0
  const p = s.currentTime / s.duration
  return p < 0 ? 0 : p > 1 ? 1 : p
}

export function isMuted(s: PlayerData): boolean {
  return s.volume === 0
}

/** The next song in the queue (order-mode preview), or `undefined`. */
export function nextSongOf(s: PlayerData): Song | undefined {
  if (!hasNext(s) || s.playlist.length === 0) return undefined
  const nextIndex = (s.currentIndex + 1) % s.playlist.length
  return s.playlist[nextIndex]
}
