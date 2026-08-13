/**
 * Native SongloftAudio binding.
 *
 * Adapts the Android/iOS native module (`NativeModules.SongloftAudio`, backed by
 * ExoPlayer / AVPlayer — see `docs/migration/lynx_native_modules_spec.md#1-songloftaudio`)
 * to the {@link SongloftAudio} facade the player store consumes. Native methods
 * are fire-and-forget (`void`); native → JS events arrive as Lynx **global
 * events** (`LynxContext.sendGlobalEvent`) which we subscribe to via the BTS
 * `GlobalEventEmitter` and re-dispatch through the facade's own `on`/`off`.
 *
 * The facade contract (methods, event types, state vocabulary) is identical to
 * the TS mock, so swapping native ⇄ mock is transparent to the store.
 *
 * The pure pieces here — {@link isNativeAudioAvailable} (probe) and
 * {@link mapGlobalEvent} (event decode) — are unit-tested without a device.
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

/** Valid `stateChanged` states (mirrors {@link AudioState}). */
const AUDIO_STATES: readonly AudioState[] = [
  'idle',
  'loading',
  'ready',
  'playing',
  'paused',
  'completed',
  'error',
]

/**
 * Global-event names the native module emits (via `sendGlobalEvent`). These
 * strings **must byte-for-byte match** the Kotlin/Swift constants
 * (`SongloftAudioEngine.EVENT_*`) — the single most error-prone seam in the
 * bridge, so they live in one place and are asserted in tests.
 */
export const NATIVE_EVENT = {
  stateChanged: 'SongloftAudio.stateChanged',
  progress: 'SongloftAudio.progress',
  error: 'SongloftAudio.error',
  remoteCommand: 'SongloftAudio.remoteCommand',
} as const

/** Native module method names required for the native binding to be usable. */
const REQUIRED_METHODS = [
  'load',
  'play',
  'pause',
  'stop',
  'seek',
  'setVolume',
  'setSpeed',
] as const

/**
 * The native module surface as exposed on `NativeModules.SongloftAudio`.
 * Methods are fire-and-forget; results/state come back over global events.
 */
export interface SongloftAudioNativeModule {
  load(url: string, opts: { hls?: boolean; headers?: Record<string, string> }): void
  play(): void
  pause(): void
  stop(): void
  seek(positionMs: number): void
  setVolume(volume: number): void
  setSpeed(rate: number): void
  setQueue(items: unknown[], startIndex: number): void
  next(): void
  previous(): void
  setRepeatMode(mode: RepeatMode): void
  setShuffle(on: boolean): void
  setFavorite(isFavorite: boolean): void
  setEqualizerEnabled(on: boolean): void
  setEqualizerBand(index: number, gainDb: number): void
  dispose(): void
}

/** Minimal shape of the BTS `GlobalEventEmitter` we depend on. */
export interface GlobalEventSubscriber {
  addListener(eventName: string, listener: (...args: unknown[]) => void): void
  removeListener(eventName: string, listener: (...args: unknown[]) => void): void
}

/**
 * Probe: is a usable native audio module present? Requires the object to exist
 * and every {@link REQUIRED_METHODS} entry to be a function. Pure — the caller
 * injects the (possibly undefined) `NativeModules` bag so it is testable.
 */
export function isNativeAudioAvailable(
  nativeModules: { SongloftAudio?: unknown } | undefined | null,
): boolean {
  const mod = nativeModules?.SongloftAudio as Record<string, unknown> | undefined
  if (!mod) return false
  return REQUIRED_METHODS.every((name) => typeof mod[name] === 'function')
}

/**
 * Decode a native global event (name + first transparent param) into a facade
 * {@link AudioEvent}, or `null` for an unrelated / malformed event. Pure.
 *
 * `sendGlobalEvent(name, [payload])` delivers the array's first element as the
 * listener's first argument, so `payload` is the event's data object.
 */
export function mapGlobalEvent(name: string, payload: unknown): AudioEvent | null {
  const data = (payload ?? {}) as Record<string, unknown>
  switch (name) {
    case NATIVE_EVENT.stateChanged: {
      const state = data.state
      if (typeof state !== 'string' || !AUDIO_STATES.includes(state as AudioState)) return null
      return { type: 'stateChanged', state: state as AudioState }
    }
    case NATIVE_EVENT.progress:
      return {
        type: 'progress',
        positionMs: num(data.positionMs),
        bufferedMs: num(data.bufferedMs),
        durationMs: num(data.durationMs),
      }
    case NATIVE_EVENT.error:
      return {
        type: 'error',
        code: typeof data.code === 'string' ? data.code : 'error',
        message: typeof data.message === 'string' ? data.message : 'playback error',
      }
    case NATIVE_EVENT.remoteCommand: {
      const command = data.command
      if (command !== 'next' && command !== 'previous' && command !== 'toggleFavorite') {
        return null
      }
      return { type: 'remoteCommand', command }
    }
    default:
      return null
  }
}

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0
}

/**
 * {@link SongloftAudio} implementation delegating to the native module and
 * bridging its global events into facade listeners.
 */
export class NativeSongloftAudio implements SongloftAudio {
  private readonly listeners = new Map<AudioEventType, Set<AudioEventListener>>()
  /** Bound global-event handlers kept for removal on dispose. */
  private readonly bridged: Array<[string, (...args: unknown[]) => void]> = []

  constructor(
    private readonly native: SongloftAudioNativeModule,
    private readonly emitter: GlobalEventSubscriber | null,
  ) {
    if (emitter) {
      for (const name of Object.values(NATIVE_EVENT)) {
        const handler = (...args: unknown[]) => {
          const event = mapGlobalEvent(name, args[0])
          if (event) this.dispatch(event)
        }
        emitter.addListener(name, handler)
        this.bridged.push([name, handler])
      }
    }
  }

  // ── source & transport ──

  async load(url: string, opts?: AudioLoadOptions): Promise<void> {
    // Only forward defined keys: passing `undefined` values across the bridge
    // can surface as a present-but-null key, which the native `getBoolean` /
    // `getMap` reads would choke on. `durationMs` is mock-only and dropped here.
    //
    // Always an object, **never `null`** — even though the store's usual call
    // carries no options at all. iOS builds the ObjC invocation from the method
    // signature and reports a `LynxError` for every object parameter that
    // arrives nil (`lynx_module_darwin.mm`: "NativeModule: sub class of
    // NSObject"), so a null here would log an engine error on each track change.
    // An empty map costs nothing and both hosts read it as "no options".
    const nativeOpts: { hls?: boolean; headers?: Record<string, string> } = {}
    if (opts?.hls != null) nativeOpts.hls = opts.hls
    if (opts?.headers != null) nativeOpts.headers = opts.headers
    this.native.load(url, nativeOpts)
  }

  async play(): Promise<void> {
    this.native.play()
  }

  async pause(): Promise<void> {
    this.native.pause()
  }

  async stop(): Promise<void> {
    this.native.stop()
  }

  async seek(positionMs: number): Promise<void> {
    this.native.seek(positionMs)
  }

  async setVolume(v: number): Promise<void> {
    this.native.setVolume(v)
  }

  async setSpeed(rate: number): Promise<void> {
    this.native.setSpeed(rate)
  }

  // ── queue (JS-store-driven; native plays one item at a time, same as mock) ──

  async setQueue(items: AudioItem[], startIndex = 0): Promise<void> {
    this.native.setQueue(items, startIndex)
  }

  async next(): Promise<void> {
    this.native.next()
  }

  async previous(): Promise<void> {
    this.native.previous()
  }

  async setRepeatMode(mode: RepeatMode): Promise<void> {
    this.native.setRepeatMode(mode)
  }

  async setShuffle(on: boolean): Promise<void> {
    this.native.setShuffle(on)
  }

  async setFavorite(isFavorite: boolean): Promise<void> {
    this.native.setFavorite(isFavorite)
  }

  // ── equalizer (native stub; bands mirror the standard 10-band layout) ──

  async setEqualizerEnabled(on: boolean): Promise<void> {
    this.native.setEqualizerEnabled(on)
  }

  async setEqualizerBand(index: number, gainDb: number): Promise<void> {
    this.native.setEqualizerBand(index, gainDb)
  }

  async getEqualizerBands(): Promise<EqualizerBand[]> {
    return EQ_CENTER_FREQS.map((centerHz) => ({ centerHz, gainDb: 0 }))
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
    if (this.emitter) {
      for (const [name, handler] of this.bridged) {
        this.emitter.removeListener(name, handler)
      }
    }
    this.bridged.length = 0
    this.listeners.clear()
    try {
      this.native.dispose()
    } catch {
      // Native dispose is best-effort; never let it break teardown.
    }
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
}
