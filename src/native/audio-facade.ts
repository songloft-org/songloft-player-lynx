import { MockSongloftAudio } from './mock-audio.js'
import type { SongloftAudio } from './audio-types.js'

/**
 * SongloftAudio facade selector.
 *
 * Batch 5 always returns the timer-driven {@link MockSongloftAudio}. The real
 * per-platform native module (ExoPlayer / AVPlayer / HTMLAudioElement + hls.js /
 * libmpv, exposed as `NativeModules.SongloftAudio` on device — see
 * `docs/lynx_native_modules_spec.md#1-songloftaudio`) plugs in here in a later
 * on-device batch via {@link createNativeAudio}; the store consumes only the
 * `SongloftAudio` interface, so swapping the implementation is transparent.
 */

let singleton: SongloftAudio | null = null

/** Create a fresh mock audio instance (each call is independent — test hook). */
export function createMockAudio(): SongloftAudio {
  return new MockSongloftAudio()
}

/**
 * Placeholder for the real native player. Not wired in this batch — the on-device
 * batch will read `NativeModules.SongloftAudio` (bare global) and adapt it to the
 * {@link SongloftAudio} facade here.
 */
export function createNativeAudio(): SongloftAudio {
  // TODO(on-device batch): adapt `NativeModules.SongloftAudio` to the facade.
  throw new Error('createNativeAudio: native audio module not available yet')
}

/** Process-wide audio singleton the player store bridges to. */
export function getAudio(): SongloftAudio {
  if (!singleton) singleton = createMockAudio()
  return singleton
}

/** Test hook: replace/reset the singleton. */
export function setAudioForTests(audio: SongloftAudio | null): void {
  singleton = audio
}
