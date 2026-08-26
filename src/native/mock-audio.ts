import { safeClearInterval } from './safe-timers.js'
import {
  DEFAULT_DURATION_MS,
  EQ_CENTER_FREQS,
  type AudioEvent,
  type AudioEventListener,
  type AudioEventType,
  type AudioItem,
  type AudioLoadOptions,
  type AudioState,
  type EqualizerBand,
  type RepeatMode,
  type SongloftAudio,
} from './audio-types.js'

/** Progress tick cadence (ms) — matches the spec's "~250ms" simulation. */
const TICK_MS = 250

/**
 * Timer-driven mock of {@link SongloftAudio}.
 *
 * There is no audio decoding: `play()` starts a `setInterval` that advances a
 * simulated `positionMs` by `TICK_MS * speed` every tick and emits `progress`;
 * when it reaches the track duration it emits `completed` (the player store then
 * applies play-mode routing). The interval handle is a `number` and is always
 * cleared through {@link safeClearInterval} so an unset handle can never throw
 * Lynx's strict `clearTimeout/clearInterval` "param 0 should be Number".
 */
export class MockSongloftAudio implements SongloftAudio {
  private state: AudioState = 'idle'
  private positionMs = 0
  private durationMs = DEFAULT_DURATION_MS
  private volume = 1
  private speed = 1
  private tickHandle: number | null = null

  private items: AudioItem[] = []
  private index = -1
  private repeat: RepeatMode = 'off'
  private shuffle = false

  private eqEnabled = false
  private eqBands: EqualizerBand[] = EQ_CENTER_FREQS.map((centerHz) => ({
    centerHz,
    gainDb: 0,
  }))

  private readonly listeners = new Map<AudioEventType, Set<AudioEventListener>>()

  /**
   * What the last {@link load} was asked to open. Test-only.
   *
   * The mock used to discard both arguments (`_url`, and `opts` beyond its
   * duration), which meant no test could see *how* a song was handed to the
   * engine — and that blind spot hid a real defect: every HLS radio was loaded
   * with `hls: false`, so the native engines picked a progressive source and
   * live playlists could not play. Keeping the call visible is what lets a store
   * test assert the flag (AGENTS.md §6: a mock must be able to express what the
   * real host is told).
   */
  lastLoad: { url: string; opts?: AudioLoadOptions } | null = null

  // ── source & transport ──

  async load(url: string, opts?: AudioLoadOptions): Promise<void> {
    this.lastLoad = { url, opts }
    this.stopTick()
    this.positionMs = 0
    this.durationMs =
      opts?.durationMs != null && opts.durationMs > 0
        ? opts.durationMs
        : DEFAULT_DURATION_MS
    this.setState('loading')
    // Simulate a decode/buffer step resolving to `ready`.
    this.setState('ready')
    this.emitProgress()
  }

  async play(): Promise<void> {
    if (this.state === 'completed') this.positionMs = 0
    this.setState('playing')
    this.startTick()
  }

  async pause(): Promise<void> {
    this.stopTick()
    this.setState('paused')
  }

  async stop(): Promise<void> {
    this.stopTick()
    this.positionMs = 0
    this.setState('idle')
    this.emitProgress()
  }

  async seek(positionMs: number): Promise<void> {
    this.positionMs = this.clampPosition(positionMs)
    this.emitProgress()
  }

  async setVolume(v: number): Promise<void> {
    this.volume = Math.min(1, Math.max(0, v))
  }

  async setSpeed(rate: number): Promise<void> {
    this.speed = Math.min(3, Math.max(0.5, rate))
  }

  // ── queue ──

  async setQueue(items: AudioItem[], startIndex = 0): Promise<void> {
    this.items = [...items]
    this.index = items.length === 0 ? -1 : this.clampIndex(startIndex)
  }

  async next(): Promise<void> {
    if (this.items.length === 0) return
    this.index = this.clampIndex(this.index + 1)
    this.emit({ type: 'queueIndexChanged', index: this.index })
  }

  async previous(): Promise<void> {
    if (this.items.length === 0) return
    this.index = this.clampIndex(this.index - 1)
    this.emit({ type: 'queueIndexChanged', index: this.index })
  }

  async setRepeatMode(mode: RepeatMode): Promise<void> {
    this.repeat = mode
  }

  async setShuffle(on: boolean): Promise<void> {
    this.shuffle = on
  }

  // No real media notification in the mock — nothing to push the icon to.
  async setFavorite(_isFavorite: boolean): Promise<void> {}
  async updateNotificationLyric(_lyric: string | null): Promise<void> {}
  async getVolume(): Promise<void> {}

  // ── equalizer (placeholder) ──

  async setEqualizerEnabled(on: boolean): Promise<void> {
    this.eqEnabled = on
  }

  async setEqualizerBand(index: number, gainDb: number): Promise<void> {
    if (index < 0 || index >= this.eqBands.length) return
    this.eqBands[index] = { centerHz: this.eqBands[index].centerHz, gainDb }
  }

  async getEqualizerBands(): Promise<EqualizerBand[]> {
    return this.eqBands.map((b) => ({ ...b }))
  }

  // ── events ──

  on<T extends AudioEventType>(type: T, cb: AudioEventListener<T>): () => void {
    let set = this.listeners.get(type)
    if (!set) {
      set = new Set()
      this.listeners.set(type, set)
    }
    set.add(cb as unknown as AudioEventListener)
    return () => this.off(type, cb)
  }

  off<T extends AudioEventType>(type: T, cb: AudioEventListener<T>): void {
    this.listeners.get(type)?.delete(cb as unknown as AudioEventListener)
  }

  dispose(): void {
    this.stopTick()
    this.listeners.clear()
  }

  /**
   * Test hook (not part of `SongloftAudio`): emit a playback failure.
   *
   * The mock never fails on its own — `load` always resolves through
   * `loading` → `ready` — so the error path has no other way to be exercised.
   * The player store's retry/backoff is the thing that needs it.
   */
  simulateError(message = 'mock failure', code = 'mock'): void {
    this.stopTick()
    this.setState('error')
    this.emit({ type: 'error', code, message })
  }

  /**
   * Test hook (not part of `SongloftAudio`): emit a `progress` event whose duration
   * is not known yet.
   *
   * Both hosts do this for real — ExoPlayer's `C.TIME_UNSET` and AVPlayer's
   * `indefinite` are each normalised to 0 — and AVPlayer stays there for the first
   * moment of a remote track. The mock is handed the duration up front by `load`, so
   * it otherwise never reproduces that precondition, which is what let the store's
   * unconditional `duration: e.durationMs` blank the total time unnoticed.
   */
  simulateUnknownDurationProgress(positionMs = this.positionMs): void {
    this.emit({ type: 'progress', positionMs, bufferedMs: 0, durationMs: 0 })
  }

  // ── internals ──

  private setState(state: AudioState): void {
    if (this.state === state) return
    this.state = state
    this.emit({ type: 'stateChanged', state })
  }

  private startTick(): void {
    // Guard against a double-start leaking a handle.
    this.stopTick()
    this.tickHandle = setInterval(() => this.tick(), TICK_MS) as unknown as number
  }

  private stopTick(): void {
    this.tickHandle = safeClearInterval(this.tickHandle)
  }

  private tick(): void {
    this.positionMs += Math.round(TICK_MS * this.speed)
    if (this.positionMs >= this.durationMs) {
      this.positionMs = this.durationMs
      this.emitProgress()
      this.stopTick()
      this.setState('completed')
      return
    }
    this.emitProgress()
  }

  private emitProgress(): void {
    // Mock buffering: everything up to a few seconds ahead is "buffered".
    const bufferedMs = Math.min(this.durationMs, this.positionMs + 5_000)
    this.emit({
      type: 'progress',
      positionMs: this.positionMs,
      bufferedMs,
      durationMs: this.durationMs,
    })
  }

  private emit(event: AudioEvent): void {
    const set = this.listeners.get(event.type)
    if (!set) return
    for (const cb of [...set]) {
      try {
        ;(cb as AudioEventListener)(event)
      } catch {
        // A misbehaving listener must not break the emit loop.
      }
    }
  }

  private clampPosition(ms: number): number {
    if (!Number.isFinite(ms)) return 0
    return Math.min(this.durationMs, Math.max(0, Math.round(ms)))
  }

  private clampIndex(i: number): number {
    if (this.items.length === 0) return -1
    return Math.min(this.items.length - 1, Math.max(0, i))
  }
}
