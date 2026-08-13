import { MockSongloftAudio } from './mock-audio.js'
import { WebSongloftAudio, isWebAudioEnvironment } from './web-audio.js'
import { readLynxGlobal, readNativeModules } from './native-modules.js'
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
 * `docs/migration/lynx_native_modules_spec.md#1-songloftaudio`); its state/progress/error
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
 * Obtain the BTS `GlobalEventEmitter` (used to receive native audio events).
 * `lynx` is a bare global provided by the runtime; guard with `typeof`.
 */
function readGlobalEventEmitter(): GlobalEventSubscriber | null {
  try {
    const l = readLynxGlobal()
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
  // Web environment: use HTMLAudioElement-based playback
  if (isWebAudioEnvironment()) {
    return new WebSongloftAudio()
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
