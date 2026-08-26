/**
 * SongloftAudio facade types.
 *
 * Interface + event contract ported from the native-module spec
 * (`docs/archive/migration/lynx_native_modules_spec.md#1-songloftaudio`). Batch 5 ships a
 * timer-driven **TS mock** implementation (`mock-audio.ts`); the real
 * per-platform native modules (ExoPlayer / AVPlayer / HTMLAudioElement / libmpv)
 * land in later on-device batches behind the same facade (`createNativeAudio`).
 */

/** Player lifecycle states (spec: `stateChanged.state`). */
export type AudioState =
  | 'idle'
  | 'loading'
  | 'ready'
  | 'playing'
  | 'paused'
  | 'completed'
  | 'error'

/** Repeat mode for the native queue (spec: `setRepeatMode`). */
export type RepeatMode = 'off' | 'one' | 'all'

/** A queue entry. `durationMs` lets the mock model progress without decoding. */
export interface AudioItem {
  id: string | number
  url: string
  durationMs?: number
  title?: string
  artist?: string
  /**
   * Fully-resolved cover URL (base + `access_token`) for the media notification
   * and lock screen. Both native modules already read this key off the bridge
   * (`parseQueueMetadata`) — Android feeds it to `MediaMetadata.setArtworkUri`
   * and media3 fetches it asynchronously. Omit rather than pass an empty string
   * when the song has no cover.
   */
  artworkUrl?: string
}

/** Options for `load`. `durationMs` is a mock-only extension (native ignores it). */
export interface AudioLoadOptions {
  hls?: boolean
  headers?: Record<string, string>
  /** Mock extension: total track duration so progress can be simulated. */
  durationMs?: number
}

/** One equalizer band descriptor (spec: 10 bands, 31Hz–16kHz). */
export interface EqualizerBand {
  centerHz: number
  gainDb: number
}

/** A media-notification / lock-screen remote command not backed by a real seek. */
export type RemoteCommand = 'next' | 'previous' | 'toggleFavorite'

/** Discriminated union of events the player emits (spec: `AudioEvent`). */
export type AudioEvent =
  | { type: 'stateChanged'; state: AudioState }
  | { type: 'progress'; positionMs: number; bufferedMs: number; durationMs: number }
  | { type: 'queueIndexChanged'; index: number }
  | { type: 'error'; code: string; message: string }
  | { type: 'remoteCommand'; command: RemoteCommand }

export type AudioEventType = AudioEvent['type']

/** Narrow an `AudioEvent` to a specific `type`. */
export type AudioEventOf<T extends AudioEventType> = Extract<AudioEvent, { type: T }>

/** Listener for a specific event type. */
export type AudioEventListener<T extends AudioEventType = AudioEventType> = (
  event: AudioEventOf<T>,
) => void

/**
 * The SongloftAudio facade. Source/transport + queue + equalizer placeholders,
 * plus a subscription API (`on` / `off`) the player store bridges to.
 */
export interface SongloftAudio {
  // ── source & transport ──
  load(url: string, opts?: AudioLoadOptions): Promise<void>
  play(): Promise<void>
  pause(): Promise<void>
  stop(): Promise<void>
  seek(positionMs: number): Promise<void>
  setVolume(v: number): Promise<void> // 0..1
  setSpeed(rate: number): Promise<void> // 0.5..3.0

  // ── queue ──
  setQueue(items: AudioItem[], startIndex?: number): Promise<void>
  next(): Promise<void>
  previous(): Promise<void>
  setRepeatMode(mode: RepeatMode): Promise<void>
  setShuffle(on: boolean): Promise<void>

  // ── media notification favorite button (native-only; mock is a no-op) ──
  /** Push the current track's favorite state so the notification icon matches. */
  setFavorite(isFavorite: boolean): Promise<void>

  // ── equalizer (placeholder; real DSP lands with native audio) ──
  setEqualizerEnabled(on: boolean): Promise<void>
  setEqualizerBand(index: number, gainDb: number): Promise<void>
  getEqualizerBands(): Promise<EqualizerBand[]>

  // ── events ──
  on<T extends AudioEventType>(type: T, cb: AudioEventListener<T>): () => void
  off<T extends AudioEventType>(type: T, cb: AudioEventListener<T>): void

  /** Release timers/resources (mock housekeeping; native releases the player). */
  dispose(): void
}

/** Default duration (ms) the mock assigns when a track has none. */
export const DEFAULT_DURATION_MS = 180_000

/** Standard 10-band EQ center frequencies (31Hz–16kHz), spec §1. */
export const EQ_CENTER_FREQS: readonly number[] = [
  31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000,
]
