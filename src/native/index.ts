export type {
  AudioEvent,
  AudioEventListener,
  AudioEventType,
  AudioItem,
  AudioLoadOptions,
  AudioState,
  EqualizerBand,
  RepeatMode,
  SongloftAudio,
} from './audio-types.js'
export { DEFAULT_DURATION_MS, EQ_CENTER_FREQS } from './audio-types.js'
export { MockSongloftAudio } from './mock-audio.js'
export {
  createMockAudio,
  createNativeAudio,
  getAudio,
  resolveAudio,
  setAudioForTests,
} from './audio-facade.js'
export {
  NATIVE_EVENT,
  NativeSongloftAudio,
  isNativeAudioAvailable,
  mapGlobalEvent,
  type GlobalEventSubscriber,
  type SongloftAudioNativeModule,
} from './native-audio.js'
export { WebSongloftAudio, isWebAudioEnvironment } from './web-audio.js'
export { isWebEnvironment, webOpenURL, webPickAndUploadFile } from './web-platform.js'
export { getPlatformCapabilities } from './platform-capabilities.js'
export type { PlatformCapabilities } from './platform-capabilities.js'
export { safeClearInterval, safeClearTimeout } from './safe-timers.js'
