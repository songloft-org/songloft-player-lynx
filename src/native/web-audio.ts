/**
 * Web SongloftAudio implementation.
 *
 * Drives an `HTMLAudioElement` for playback, with optional `hls.js` for HLS
 * streams and the Web Audio API (`BiquadFilterNode` chain) for the 10-band
 * equalizer. Lock-screen / media controls use `navigator.mediaSession`.
 *
 * The facade contract (methods, event types, state vocabulary) is identical to
 * the TS mock and the native binding, so swapping is transparent to the store.
 *
 * ⚠️ **This class is currently dead code (2026-08-14).** The web-core runtime
 * runs the app in a real Web Worker, where `HTMLAudioElement` / `Audio` /
 * `AudioContext` / `navigator.mediaSession` are all undefined. The
 * `isWebAudioEnvironment()` probe below is permanently false, so
 * `audio-facade.ts` never constructs `WebSongloftAudio`, and the player falls
 * through to the silent mock.
 *
 * The fix registers a main-thread `HTMLAudioElement` as a native module
 * (`web/audio-host.js` → `lynxView.nativeModulesMap`), which makes
 * `NativeModules.SongloftAudio` resolve in the worker and lets the already-tested
 * `NativeSongloftAudio` path handle playback. This class is retained for
 * reference — its EQ / HLS / MediaSession logic may be ported to the main-thread
 * adapter in a follow-up.
 */

import {
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

/**
 * Check whether the Web Audio API + HTMLAudioElement are available in the
 * current runtime. Use this to detect a Web platform.
 */
export function isWebAudioEnvironment(): boolean {
  return typeof HTMLAudioElement !== 'undefined'
}

/**
 * Minimal HLS.js interface we depend on (loaded dynamically via global script).
 */
interface HlsInstance {
  loadSource(url: string): void
  attachMedia(el: HTMLMediaElement): void
  destroy(): void
  on(event: string, cb: (...args: unknown[]) => void): void
}

/** Check if hls.js is available in the global scope. */
function isHlsJsAvailable(): boolean {
  const H = (globalThis as Record<string, unknown>).Hls
  return typeof H === 'function' && typeof (H as { isSupported?: () => boolean }).isSupported === 'function'
}

/** Check if hls.js is supported (MSE available). */
function isHlsJsSupported(): boolean {
  try {
    const H = (globalThis as Record<string, unknown>).Hls as { isSupported(): boolean }
    return H.isSupported()
  } catch {
    return false
  }
}

/** Get the Hls constructor from the global scope. */
function getHlsConstructor(): { new(): HlsInstance; isSupported(): boolean } | null {
  try {
    const H = (globalThis as Record<string, unknown>).Hls
    if (typeof H === 'function') return H as { new(): HlsInstance; isSupported(): boolean }
  } catch {
    // ignore
  }
  return null
}

// ── constants ──

/** Progress tick cadence (ms) — matches the native event cadence. */
const TICK_MS = 250

/** EQ filter type constants for the BiquadFilterNode chain. */
const FILTER_TYPES: BiquadFilterType[] = [
  'lowshelf',
  'peaking', 'peaking', 'peaking', 'peaking',
  'peaking', 'peaking', 'peaking', 'peaking',
  'highshelf',
]

// ── WebSongloftAudio ──

export class WebSongloftAudio implements SongloftAudio {
  private audio: HTMLAudioElement
  private hls: HlsInstance | null = null
  private hlsSupported = false
  private state: AudioState = 'idle'
  private positionMs = 0
  private durationMs = 0
  private volume = 1
  private speed = 1

  // EQ
  private eqContext: AudioContext | null = null
  private eqSource: MediaElementAudioSourceNode | null = null
  private eqFilters: BiquadFilterNode[] = []
  private eqEnabled = false
  private eqBands: EqualizerBand[] = EQ_CENTER_FREQS.map((centerHz) => ({
    centerHz,
    gainDb: 0,
  }))

  // Queue (the store drives this; we keep the state for completeness)
  private items: AudioItem[] = []
  private index = -1
  private repeat: RepeatMode = 'off'
  private shuffle = false

  private readonly listeners = new Map<AudioEventType, Set<AudioEventListener>>()
  private readonly boundHandlers: Array<[string, (e: Event) => void]> = []

  private progressTimer: ReturnType<typeof setInterval> | null = null

  constructor() {
    const audio = new Audio()
    audio.preload = 'auto'
    audio.crossOrigin = 'anonymous'
    this.audio = audio

    // Detect hls.js support
    this.hlsSupported = this.detectHls()

    // Bind native events
    this.bindEvent('play', () => this.handlePlay())
    this.bindEvent('pause', () => this.handlePause())
    this.bindEvent('ended', () => this.handleEnded())
    this.bindEvent('error', () => this.handleError())
    this.bindEvent('loadedmetadata', () => this.handleLoadedMetadata())
    this.bindEvent('waiting', () => this.handleWaiting())
    this.bindEvent('canplay', () => this.handleCanPlay())
  }

  // ── source & transport ──

  async load(url: string, opts?: AudioLoadOptions): Promise<void> {
    this.stop()
    this.cleanupHls()
    this.setState('loading')

    this.audio.src = ''

    if (opts?.hls) {
      await this.loadHls(url)
    } else {
      this.audio.src = url
    }

    // Wait for metadata to determine duration
    // loadedmetadata will set the state to 'ready'
  }

  async play(): Promise<void> {
    if (this.state === 'completed') {
      this.audio.currentTime = 0
    }
    try {
      await this.audio.play()
      // handlePlay will be called by the play event
    } catch (err) {
      // Autoplay may be blocked; emit an error
      this.dispatch({
        type: 'error',
        code: 'play_blocked',
        message: (err as Error).message || 'play() was prevented',
      })
    }
  }

  async pause(): Promise<void> {
    this.audio.pause()
    // handlePause will be called by the pause event
  }

  async stop(): Promise<void> {
    this.audio.pause()
    this.audio.currentTime = 0
    this.audio.src = ''
    this.stopProgress()
    this.positionMs = 0
    this.setState('idle')
    this.emitProgress()
  }

  async seek(positionMs: number): Promise<void> {
    const sec = Math.max(0, Math.min(positionMs / 1000, this.audio.duration || 0))
    this.audio.currentTime = sec
    this.positionMs = Math.round(sec * 1000)
    this.emitProgress()
  }

  async setVolume(v: number): Promise<void> {
    this.volume = Math.min(1, Math.max(0, v))
    this.audio.volume = this.volume
  }

  async setSpeed(rate: number): Promise<void> {
    this.speed = Math.min(3, Math.max(0.5, rate))
    this.audio.playbackRate = this.speed
  }

  // ── queue (store-driven; we track for forward/backward / remote commands) ──

  async setQueue(items: AudioItem[], startIndex = 0): Promise<void> {
    this.items = [...items]
    this.index = items.length === 0 ? -1 : this.clampIndex(startIndex)
  }

  async next(): Promise<void> {
    if (this.items.length === 0) return
    this.index = this.clampIndex(this.index + 1)
    this.dispatch({ type: 'queueIndexChanged', index: this.index })
  }

  async previous(): Promise<void> {
    if (this.items.length === 0) return
    this.index = this.clampIndex(this.index - 1)
    this.dispatch({ type: 'queueIndexChanged', index: this.index })
  }

  async setRepeatMode(mode: RepeatMode): Promise<void> {
    this.repeat = mode
  }

  async setShuffle(on: boolean): Promise<void> {
    this.shuffle = on
  }

  async setFavorite(_isFavorite: boolean): Promise<void> {
    // No real media notification in Web — the favorite icon is handled by the UI.
  }

  async updateNotificationLyric(_lyric: string | null, _inTitle?: boolean): Promise<void> {}

  async getVolume(): Promise<void> {}

  // ── equalizer (Web Audio API BiquadFilterNode chain) ──

  async setEqualizerEnabled(on: boolean): Promise<void> {
    this.eqEnabled = on
    if (on) {
      await this.ensureEqContext()
      this.connectEq()
    } else {
      this.disconnectEq()
    }
  }

  async setEqualizerBand(index: number, gainDb: number): Promise<void> {
    if (index < 0 || index >= this.eqBands.length) return
    this.eqBands[index] = {
      centerHz: this.eqBands[index].centerHz,
      gainDb,
    }
    // Update the live filter if it exists
    if (this.eqFilters[index]) {
      this.eqFilters[index].gain.value = gainDb
    }
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
    this.stop()
    this.cleanupHls()
    this.cleanupEq()
    this.unbindAll()
    this.audio.src = ''
    this.listeners.clear()
  }

  // ── private: audio element event handlers ──

  private handlePlay(): void {
    this.setState('playing')
    this.startProgress()
    this.updateMediaSessionPlayback()
  }

  private handlePause(): void {
    this.stopProgress()
    this.setState('paused')
    this.updateMediaSessionPlayback()
  }

  private handleEnded(): void {
    this.stopProgress()
    this.positionMs = this.durationMs
    this.emitProgress()
    this.setState('completed')
    this.updateMediaSessionPlayback()
  }

  private handleError(): void {
    const mediaErr = this.audio.error
    this.setState('error')
    this.dispatch({
      type: 'error',
      code: mediaErr ? `MEDIA_ERR_${mediaErr.code}` : 'unknown',
      message: mediaErr?.message || 'audio playback error',
    })
  }

  private handleLoadedMetadata(): void {
    this.durationMs = Math.round((this.audio.duration || 0) * 1000)
    this.setState('ready')
    this.emitProgress()
    this.updateMediaSession()
  }

  private handleWaiting(): void {
    // Audio is buffering — the store can use this to show a spinner
  }

  private handleCanPlay(): void {
    if (this.state === 'loading') {
      this.setState('ready')
    }
  }

  // ── private: HLS ──

  private detectHls(): boolean {
    return isHlsJsSupported()
  }

  private async loadHls(url: string): Promise<void> {
    if (isHlsJsAvailable()) {
      try {
        const HlsClass = getHlsConstructor()
        if (HlsClass && HlsClass.isSupported()) {
          const hls = new HlsClass()
          hls.on('hlsError', (...args: unknown[]) => {
            console.warn('[WebSongloftAudio] hls.js error:', args[1])
          })
          hls.attachMedia(this.audio)
          hls.loadSource(url)
          this.hls = hls
          return
        }
      } catch {
        // hls.js not available
      }
    }

    // Fallback: native HLS (Safari)
    this.audio.src = url
  }

  private cleanupHls(): void {
    if (this.hls) {
      try {
        this.hls.destroy()
      } catch {
        // ignore
      }
      this.hls = null
    }
  }

  // ── private: equalizer (Web Audio API) ──

  private async ensureEqContext(): Promise<void> {
    if (this.eqContext) return
    const ctx = new AudioContext()
    // Resume if suspended (autoplay policy)
    if (ctx.state === 'suspended') {
      await ctx.resume()
    }
    this.eqContext = ctx

    // Create the source node from the audio element
    this.eqSource = ctx.createMediaElementSource(this.audio)

    // Create the filter chain: lowshelf + 8 peaking + highshelf
    this.eqFilters = []
    for (let i = 0; i < EQ_CENTER_FREQS.length; i++) {
      const freq = EQ_CENTER_FREQS[i]
      const filter = ctx.createBiquadFilter()
      filter.type = FILTER_TYPES[i]
      filter.frequency.value = freq
      filter.Q.value = 1
      filter.gain.value = this.eqBands[i].gainDb
      this.eqFilters.push(filter)
    }
  }

  private connectEq(): void {
    if (!this.eqSource || !this.eqContext || this.eqFilters.length === 0) return
    // Disconnect any existing connections first
    try {
      this.eqSource.disconnect()
    } catch {
      // not connected yet
    }

    // Chain: source → filter[0] → filter[1] → ... → filter[N-1] → destination
    this.eqSource.connect(this.eqFilters[0])
    for (let i = 0; i < this.eqFilters.length - 1; i++) {
      this.eqFilters[i].connect(this.eqFilters[i + 1])
    }
    this.eqFilters[this.eqFilters.length - 1].connect(this.eqContext.destination)
  }

  private disconnectEq(): void {
    if (!this.eqSource || !this.eqContext) return
    try {
      this.eqSource.disconnect()
    } catch {
      // ignore
    }
    for (const f of this.eqFilters) {
      try {
        f.disconnect()
      } catch {
        // ignore
      }
    }
    // Connect source directly to destination (bypass)
    this.eqSource.connect(this.eqContext.destination)
  }

  private cleanupEq(): void {
    this.disconnectEq()
    this.eqFilters = []
    if (this.eqSource) {
      try {
        this.eqSource.disconnect()
      } catch {
        // ignore
      }
      this.eqSource = null
    }
    if (this.eqContext) {
      this.eqContext.close().catch(() => {})
      this.eqContext = null
    }
  }

  // ── private: progress timer ──

  private startProgress(): void {
    this.stopProgress()
    this.progressTimer = setInterval(() => {
      if (this.audio && !this.audio.paused && !this.audio.ended) {
        this.positionMs = Math.round((this.audio.currentTime || 0) * 1000)
        this.durationMs = Math.round((this.audio.duration || 0) * 1000)
        this.emitProgress()
      }
    }, TICK_MS)
  }

  private stopProgress(): void {
    if (this.progressTimer != null) {
      clearInterval(this.progressTimer)
      this.progressTimer = null
    }
  }

  // ── private: Media Session API ──

  private updateMediaSession(): void {
    if (!('mediaSession' in navigator)) return

    const currentItem = this.items[this.index]
    if (!currentItem) return

    navigator.mediaSession.metadata = new MediaMetadata({
      title: currentItem.title || 'Unknown',
      artist: currentItem.artist || '',
      album: '',
    })

    // Set action handlers
    navigator.mediaSession.setActionHandler('play', () => {
      this.play()
    })
    navigator.mediaSession.setActionHandler('pause', () => {
      this.pause()
    })
    navigator.mediaSession.setActionHandler('seekbackward', () => {
      this.seek(Math.max(0, this.positionMs - 10_000))
    })
    navigator.mediaSession.setActionHandler('seekforward', () => {
      this.seek(this.positionMs + 10_000)
    })
    navigator.mediaSession.setActionHandler('previoustrack', () => {
      this.dispatch({ type: 'remoteCommand', command: 'previous' })
    })
    navigator.mediaSession.setActionHandler('nexttrack', () => {
      this.dispatch({ type: 'remoteCommand', command: 'next' })
    })
  }

  private updateMediaSessionPlayback(): void {
    if (!('mediaSession' in navigator)) return
    navigator.mediaSession.playbackState = this.state === 'playing' ? 'playing' : 'paused'
  }

  // ── private: helpers ──

  private setState(state: AudioState): void {
    if (this.state === state) return
    this.state = state
    this.dispatch({ type: 'stateChanged', state })
  }

  private emitProgress(): void {
    this.dispatch({
      type: 'progress',
      positionMs: this.positionMs,
      bufferedMs: this.positionMs + 5_000, // rough estimate
      durationMs: this.durationMs,
    })
  }

  private dispatch(event: AudioEvent): void {
    const set = this.listeners.get(event.type)
    if (!set) return
    for (const cb of [...set]) {
      try {
        ;(cb as AudioEventListener)(event)
      } catch {
        // A misbehaving listener must not break the dispatch loop.
      }
    }
  }

  private bindEvent(name: string, handler: (e: Event) => void): void {
    const bound = handler.bind(this) as (e: Event) => void
    this.audio.addEventListener(name, bound)
    this.boundHandlers.push([name, bound])
  }

  private unbindAll(): void {
    for (const [name, handler] of this.boundHandlers) {
      this.audio.removeEventListener(name, handler)
    }
    this.boundHandlers.length = 0
  }

  private clampIndex(i: number): number {
    if (this.items.length === 0) return -1
    return Math.min(this.items.length - 1, Math.max(0, i))
  }
}