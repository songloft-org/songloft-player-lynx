import { MockSongloftAudio } from './mock-audio.js'
import {
  NativeSongloftAudio,
  isNativeAudioAvailable,
  type GlobalEventSubscriber,
  type SongloftAudioNativeModule,
} from './native-audio.js'
import type { SongloftAudio } from './audio-types.js'

/**
 * SongloftAudio facade selector.
 *
 * On device the real native module is exposed as the bare global
 * `NativeModules.SongloftAudio` (ExoPlayer on Android, AVPlayer on iOS — see
 * `docs/lynx_native_modules_spec.md#1-songloftaudio`); its state/progress/error
 * events arrive as Lynx global events over the BTS `GlobalEventEmitter`. When a
 * complete native module is present we use {@link NativeSongloftAudio}; anywhere
 * it is missing (dev in a plain host, tests, unsupported platform) we fall back
 * to the timer-driven {@link MockSongloftAudio}. The player store consumes only
 * the `SongloftAudio` interface, so the swap is transparent.
 */

let singleton: SongloftAudio | null = null

/** Create a fresh mock audio instance (each call is independent — test hook). */
export function createMockAudio(): SongloftAudio {
  return new MockSongloftAudio()
}

/**
 * Read the bare-global `NativeModules` bag safely. Like `fetch`/`self`, Lynx
 * exposes it as a bare identifier (not `globalThis.NativeModules`), so probe
 * with a `typeof` guard first (reading an undeclared bare identifier throws),
 * then fall back to `globalThis` (used by tests, which set it there).
 */
function readNativeModules(): { SongloftAudio?: unknown } | undefined {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (typeof NativeModules !== 'undefined') return NativeModules as any
  } catch {
    // undeclared bare identifier — fall through to globalThis
  }
  return (globalThis as { NativeModules?: { SongloftAudio?: unknown } }).NativeModules
}

/**
 * Obtain the BTS `GlobalEventEmitter` (used to receive native audio events).
 * `lynx` is a bare global provided by the runtime; guard with `typeof`.
 */
function readGlobalEventEmitter(): GlobalEventSubscriber | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const l = typeof lynx !== 'undefined' ? (lynx as any) : (globalThis as any).lynx
    if (l && typeof l.getJSModule === 'function') {
      return (l.getJSModule('GlobalEventEmitter') as GlobalEventSubscriber) ?? null
    }
  } catch {
    // no runtime lynx (tests / non-Lynx host)
  }
  return null
}

/**
 * Select the audio implementation for the current runtime: the native binding
 * when a complete `NativeModules.SongloftAudio` is present, else the mock. Not
 * memoized — {@link getAudio} caches; tests call this directly per scenario.
 */
export function resolveAudio(): SongloftAudio {
  const nativeModules = readNativeModules()
  if (isNativeAudioAvailable(nativeModules)) {
    try {
      const mod = (nativeModules as { SongloftAudio: SongloftAudioNativeModule }).SongloftAudio
      return new NativeSongloftAudio(mod, readGlobalEventEmitter())
    } catch {
      // Any failure constructing the native binding → fall back to the mock.
    }
  }
  return createMockAudio()
}

/**
 * Construct the native binding, or throw if no usable native module is present.
 * Retained as an explicit entry point; {@link resolveAudio} is the normal path.
 */
export function createNativeAudio(): SongloftAudio {
  const nativeModules = readNativeModules()
  if (!isNativeAudioAvailable(nativeModules)) {
    throw new Error('createNativeAudio: NativeModules.SongloftAudio not available')
  }
  const mod = (nativeModules as { SongloftAudio: SongloftAudioNativeModule }).SongloftAudio
  return new NativeSongloftAudio(mod, readGlobalEventEmitter())
}

/** Process-wide audio singleton the player store bridges to. */
export function getAudio(): SongloftAudio {
  if (!singleton) singleton = resolveAudio()
  return singleton
}

/** Test hook: replace/reset the singleton. */
export function setAudioForTests(audio: SongloftAudio | null): void {
  singleton = audio
}
