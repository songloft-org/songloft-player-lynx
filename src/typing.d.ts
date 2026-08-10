/**
 * Native-module type declarations.
 *
 * `NativeModules` is a bare global provided by the Lynx BTS runtime (typed by
 * `@lynx-js/types` with an index signature). This augments it with the strongly
 * typed `SongloftAudio` member so `NativeModules.SongloftAudio` is checked at
 * the facade boundary (`src/native/audio-facade.ts`). The canonical shape lives
 * in `src/native/native-audio.ts` (`SongloftAudioNativeModule`); the method +
 * event contract mirrors `docs/lynx_native_modules_spec.md#1-songloftaudio` and
 * the Android implementation `android/.../audio/SongloftAudioModule.kt`.
 *
 * See the official "Native Modules" guide: interfaces are declared on the global
 * `NativeModules` object; usage is `NativeModules.<Module>.<method>()` from the
 * background thread only.
 */

import type { SongloftAudioNativeModule } from './native/native-audio.js'

declare module '@lynx-js/types/background' {
  interface NativeModules {
    /** Real native audio backend (ExoPlayer / AVPlayer). Absent in mock hosts. */
    SongloftAudio?: SongloftAudioNativeModule
  }
}

export {}
