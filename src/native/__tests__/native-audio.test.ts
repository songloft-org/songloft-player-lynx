import { afterEach, describe, expect, test, vi } from 'vitest'

import {
  NATIVE_EVENT,
  NativeSongloftAudio,
  isNativeAudioAvailable,
  mapGlobalEvent,
  type GlobalEventSubscriber,
  type SongloftAudioNativeModule,
} from '../native-audio.js'
import { MockSongloftAudio } from '../mock-audio.js'
import { createNativeAudio, resolveAudio, setAudioForTests } from '../audio-facade.js'
import type { AudioEvent } from '../audio-types.js'

/** A native module test double: every required method is a spy. */
function makeNativeModule(): SongloftAudioNativeModule & Record<string, ReturnType<typeof vi.fn>> {
  return {
    load: vi.fn(),
    play: vi.fn(),
    pause: vi.fn(),
    stop: vi.fn(),
    seek: vi.fn(),
    setVolume: vi.fn(),
    setSpeed: vi.fn(),
    setQueue: vi.fn(),
    next: vi.fn(),
    previous: vi.fn(),
    setRepeatMode: vi.fn(),
    setShuffle: vi.fn(),
    setFavorite: vi.fn(),
    setEqualizerEnabled: vi.fn(),
    setEqualizerBand: vi.fn(),
    dispose: vi.fn(),
  } as unknown as SongloftAudioNativeModule & Record<string, ReturnType<typeof vi.fn>>
}

/** A GlobalEventEmitter double whose registered listeners we can fire. */
function makeEmitter(): GlobalEventSubscriber & {
  fire(name: string, payload: unknown): void
  count(name: string): number
} {
  const map = new Map<string, Set<(...args: unknown[]) => void>>()
  return {
    addListener(name, listener) {
      let set = map.get(name)
      if (!set) map.set(name, (set = new Set()))
      set.add(listener)
    },
    removeListener(name, listener) {
      map.get(name)?.delete(listener)
    },
    fire(name, payload) {
      for (const l of map.get(name) ?? []) l(payload)
    },
    count(name) {
      return map.get(name)?.size ?? 0
    },
  }
}

afterEach(() => {
  setAudioForTests(null)
  delete (globalThis as { NativeModules?: unknown }).NativeModules
  delete (globalThis as { lynx?: unknown }).lynx
})

describe('isNativeAudioAvailable (probe)', () => {
  test('true only when every required method is present', () => {
    expect(isNativeAudioAvailable(undefined)).toBe(false)
    expect(isNativeAudioAvailable(null)).toBe(false)
    expect(isNativeAudioAvailable({})).toBe(false)
    expect(isNativeAudioAvailable({ SongloftAudio: {} })).toBe(false)
    // Missing one required method (setSpeed) → not usable.
    const partial = makeNativeModule() as unknown as Record<string, unknown>
    delete partial.setSpeed
    expect(isNativeAudioAvailable({ SongloftAudio: partial })).toBe(false)
    expect(isNativeAudioAvailable({ SongloftAudio: makeNativeModule() })).toBe(true)
  })
})

describe('mapGlobalEvent (native → facade decode)', () => {
  test('event names are the exact strings the native module emits', () => {
    expect(NATIVE_EVENT.stateChanged).toBe('SongloftAudio.stateChanged')
    expect(NATIVE_EVENT.progress).toBe('SongloftAudio.progress')
    expect(NATIVE_EVENT.error).toBe('SongloftAudio.error')
    expect(NATIVE_EVENT.remoteCommand).toBe('SongloftAudio.remoteCommand')
  })

  test('decodes stateChanged with a valid state', () => {
    expect(mapGlobalEvent(NATIVE_EVENT.stateChanged, { state: 'playing' })).toEqual({
      type: 'stateChanged',
      state: 'playing',
    })
  })

  test('rejects an unknown / malformed stateChanged', () => {
    expect(mapGlobalEvent(NATIVE_EVENT.stateChanged, { state: 'bogus' })).toBeNull()
    expect(mapGlobalEvent(NATIVE_EVENT.stateChanged, {})).toBeNull()
  })

  test('decodes progress and coerces non-numbers to 0', () => {
    expect(
      mapGlobalEvent(NATIVE_EVENT.progress, {
        positionMs: 1200,
        bufferedMs: 5000,
        durationMs: 180000,
      }),
    ).toEqual({ type: 'progress', positionMs: 1200, bufferedMs: 5000, durationMs: 180000 })
    expect(mapGlobalEvent(NATIVE_EVENT.progress, {})).toEqual({
      type: 'progress',
      positionMs: 0,
      bufferedMs: 0,
      durationMs: 0,
    })
  })

  test('decodes error with fallbacks', () => {
    expect(mapGlobalEvent(NATIVE_EVENT.error, { code: 'IO', message: 'boom' })).toEqual({
      type: 'error',
      code: 'IO',
      message: 'boom',
    })
    expect(mapGlobalEvent(NATIVE_EVENT.error, {})).toEqual({
      type: 'error',
      code: 'error',
      message: 'playback error',
    })
  })

  test('returns null for unrelated events', () => {
    expect(mapGlobalEvent('SomethingElse', { x: 1 })).toBeNull()
  })

  test('decodes a valid remoteCommand and rejects an unknown one', () => {
    expect(mapGlobalEvent(NATIVE_EVENT.remoteCommand, { command: 'next' })).toEqual({
      type: 'remoteCommand',
      command: 'next',
    })
    expect(mapGlobalEvent(NATIVE_EVENT.remoteCommand, { command: 'previous' })).toEqual({
      type: 'remoteCommand',
      command: 'previous',
    })
    expect(mapGlobalEvent(NATIVE_EVENT.remoteCommand, { command: 'toggleFavorite' })).toEqual({
      type: 'remoteCommand',
      command: 'toggleFavorite',
    })
    expect(mapGlobalEvent(NATIVE_EVENT.remoteCommand, { command: 'bogus' })).toBeNull()
    expect(mapGlobalEvent(NATIVE_EVENT.remoteCommand, {})).toBeNull()
  })
})

describe('NativeSongloftAudio (delegation + event bridge)', () => {
  test('methods delegate to the native module', async () => {
    const native = makeNativeModule()
    const audio = new NativeSongloftAudio(native, null)
    await audio.load('http://x/a.m3u8', { hls: true, headers: { A: 'b' } })
    await audio.play()
    await audio.pause()
    await audio.seek(1234)
    await audio.setVolume(0.5)
    await audio.setSpeed(1.5)
    expect(native.load).toHaveBeenCalledWith('http://x/a.m3u8', {
      hls: true,
      headers: { A: 'b' },
    })
    expect(native.play).toHaveBeenCalledTimes(1)
    expect(native.pause).toHaveBeenCalledTimes(1)
    expect(native.seek).toHaveBeenCalledWith(1234)
    expect(native.setVolume).toHaveBeenCalledWith(0.5)
    expect(native.setSpeed).toHaveBeenCalledWith(1.5)
  })

  /**
   * The store's usual call carries only the mock-only `durationMs`, so this is
   * the shape that actually runs on a device. It must still be an **object**:
   * iOS builds its ObjC invocation from the method signature and reports a
   * `LynxError` for every object parameter that arrives nil, so a `null` here
   * would log an engine error on every single track change.
   */
  test('load without native options passes an empty object, never null', async () => {
    const native = makeNativeModule()
    const audio = new NativeSongloftAudio(native, null)
    await audio.load('http://x/a.mp3', { durationMs: 1000 })
    await audio.load('http://x/b.mp3')
    expect(native.load).toHaveBeenNthCalledWith(1, 'http://x/a.mp3', {})
    expect(native.load).toHaveBeenNthCalledWith(2, 'http://x/b.mp3', {})
  })

  test('setFavorite delegates to the native module', async () => {
    const native = makeNativeModule()
    const audio = new NativeSongloftAudio(native, null)
    await audio.setFavorite(true)
    expect(native.setFavorite).toHaveBeenCalledWith(true)
  })

  test('global events re-dispatch to facade listeners', () => {
    const native = makeNativeModule()
    const emitter = makeEmitter()
    const audio = new NativeSongloftAudio(native, emitter)

    const events: AudioEvent[] = []
    audio.on('progress', (e) => events.push(e))
    audio.on('stateChanged', (e) => events.push(e))

    emitter.fire(NATIVE_EVENT.progress, {
      positionMs: 500,
      bufferedMs: 1000,
      durationMs: 10000,
    })
    emitter.fire(NATIVE_EVENT.stateChanged, { state: 'completed' })

    expect(events).toEqual([
      { type: 'progress', positionMs: 500, bufferedMs: 1000, durationMs: 10000 },
      { type: 'stateChanged', state: 'completed' },
    ])
  })

  test('dispose removes global-event listeners and releases native', () => {
    const native = makeNativeModule()
    const emitter = makeEmitter()
    const audio = new NativeSongloftAudio(native, emitter)
    // One listener per native event name is registered up front.
    expect(emitter.count(NATIVE_EVENT.progress)).toBe(1)
    audio.dispose()
    expect(emitter.count(NATIVE_EVENT.progress)).toBe(0)
    expect(native.dispose).toHaveBeenCalledTimes(1)
  })

  test('off removes a facade listener', () => {
    const emitter = makeEmitter()
    const audio = new NativeSongloftAudio(makeNativeModule(), emitter)
    const cb = vi.fn()
    audio.on('progress', cb)
    audio.off('progress', cb)
    emitter.fire(NATIVE_EVENT.progress, { positionMs: 1, bufferedMs: 1, durationMs: 1 })
    expect(cb).not.toHaveBeenCalled()
  })
})

describe('facade selection (native present → native, else mock)', () => {
  test('resolveAudio picks the native binding when the module is complete', () => {
    ;(globalThis as { NativeModules?: unknown }).NativeModules = {
      SongloftAudio: makeNativeModule(),
    }
    ;(globalThis as { lynx?: unknown }).lynx = { getJSModule: () => makeEmitter() }
    const audio = resolveAudio()
    expect(audio).toBeInstanceOf(NativeSongloftAudio)
  })

  test('resolveAudio falls back to the mock when no native module is present', () => {
    const audio = resolveAudio()
    expect(audio).toBeInstanceOf(MockSongloftAudio)
  })

  test('resolveAudio falls back to the mock when the module is incomplete', () => {
    const partial = makeNativeModule() as unknown as Record<string, unknown>
    delete partial.play
    ;(globalThis as { NativeModules?: unknown }).NativeModules = { SongloftAudio: partial }
    expect(resolveAudio()).toBeInstanceOf(MockSongloftAudio)
  })

  test('createNativeAudio throws when no native module is present', () => {
    expect(() => createNativeAudio()).toThrow(/not available/)
  })

  test('native binding works even without a GlobalEventEmitter (controls only)', () => {
    const native = makeNativeModule()
    ;(globalThis as { NativeModules?: unknown }).NativeModules = { SongloftAudio: native }
    // lynx global absent → emitter null; construction must still succeed.
    const audio = resolveAudio()
    expect(audio).toBeInstanceOf(NativeSongloftAudio)
  })
})
