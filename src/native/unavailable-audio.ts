import type {
  AudioEventListener,
  AudioEventType,
  EqualizerBand,
  SongloftAudio,
} from './audio-types.js'

/** A preview host must surface missing playback instead of advancing mock time. */
export function createUnavailableAudio(message: string): SongloftAudio {
  const fail = async () => {
    throw new Error(message)
  }
  const noop = async () => {}
  return {
    load: fail,
    play: fail,
    pause: noop,
    stop: noop,
    seek: fail,
    setVolume: noop,
    setSpeed: noop,
    setQueue: noop,
    next: fail,
    previous: fail,
    setRepeatMode: noop,
    setShuffle: noop,
    setFavorite: noop,
    updateNotificationLyric: noop,
    getVolume: noop,
    setEqualizerEnabled: fail,
    setEqualizerBand: fail,
    getEqualizerBands: async (): Promise<EqualizerBand[]> => [],
    on:
      <T extends AudioEventType>(_type: T, _cb: AudioEventListener<T>) =>
      () => {},
    off: () => {},
    dispose: () => {},
  }
}
