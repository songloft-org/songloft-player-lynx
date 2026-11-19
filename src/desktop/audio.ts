import { desktopCall, desktopConfig } from './client.js'
import {
  NativeSongloftAudio,
  NATIVE_EVENT,
  type GlobalEventSubscriber,
  type SongloftAudioNativeModule,
} from '../native/native-audio.js'
import { readLynxGlobal } from '../native/native-modules.js'
import type { AudioItem } from '../native/audio-types.js'
import { desktopCookies } from './cef.js'

export function desktopPluginEqualizer() {
  if (!desktopConfig()?.capabilities?.equalizer) return undefined
  return {
    getPluginEqualizerAvailable(callback: (supported: boolean) => void) {
      void desktopCall<boolean>('player.command', { method: 'pluginEqualizerAvailable' })
        .then((supported) => callback(supported === true), () => callback(false))
    },
    setPluginEqualizer(profile: string, callback: (applied: boolean) => void) {
      void desktopCall('player.command', { method: 'pluginEqualizer', value: profile })
        .then(() => callback(true), () => callback(false))
    },
  }
}

export function createDesktopAudio() {
  const emitter = readLynxGlobal()?.getJSModule?.('GlobalEventEmitter') as
    | GlobalEventSubscriber
    | undefined
  if (!emitter) throw new Error('Desktop playback events unavailable')
  let sourceId: string | undefined
  let loadGeneration = 0
  let pendingLoad: { generation: number; autoplay: boolean } | null = null
  let sourceReady: Promise<boolean> | null = null
  let finishSource: ((ready: boolean) => void) | null = null
  const local = new Map<string, Set<(...args: unknown[]) => void>>()
  const events: GlobalEventSubscriber = {
    addListener(name, listener) {
      emitter.addListener(name, listener)
      if (!local.has(name)) local.set(name, new Set())
      local.get(name)!.add(listener)
    },
    removeListener(name, listener) {
      emitter.removeListener(name, listener)
      local.get(name)?.delete(listener)
    },
  }
  const command = (
    method: string,
    value?: unknown,
    options?: Record<string, unknown>,
  ) => {
    const requestSource = sourceId
    void desktopCall('player.command', { method, value, options }).catch(
      (error) => {
        for (const listener of local.get(NATIVE_EVENT.error) ?? [])
          listener({
            sourceId: requestSource,
            code: 'desktop_player_error',
            message: String(error),
          })
      },
    )
  }
  const native: SongloftAudioNativeModule = {
    getSourceLoadVersion: (callback) => callback(1),
    load(url, options) {
      finishSource?.(false)
      sourceReady = new Promise((resolve) => {
        const timer = setTimeout(() => finishSource?.(false), 70000)
        finishSource = (ready) => {
          clearTimeout(timer)
          finishSource = null
          resolve(ready)
        }
      })
      const generation = ++loadGeneration
      sourceId = options.sourceId
      pendingLoad = { generation, autoplay: options.autoplay === true }
      command('stop')
      // Resolve cookies through CEF's real jar, and discard an older resolution
      // before it can enqueue a stale replacement into the shared player.
      void (async () => {
        const headers = { ...options.headers }
        if (
          /^https?:\/\//.test(url) &&
          !Object.keys(headers).some((key) => key.toLowerCase() === 'cookie')
        ) {
          const cookies = await desktopCookies(url).catch(() => ({}))
          const value = Object.entries(cookies)
            .map(([key, value]) => `${key}=${value}`)
            .join('; ')
          if (value) headers.Cookie = value
        }
        if (
          generation === loadGeneration &&
          pendingLoad?.generation === generation
        ) {
          command('load', url, {
            ...options,
            headers,
            autoplay: pendingLoad.autoplay,
          })
          pendingLoad = null
        }
      })()
    },
    play: () => {
      if (pendingLoad) pendingLoad.autoplay = true
      else command('play')
    },
    pause: () => {
      if (pendingLoad) pendingLoad.autoplay = false
      else command('pause')
    },
    stop: () => {
      finishSource?.(false)
      sourceReady = null
      ++loadGeneration
      pendingLoad = null
      command('stop')
    },
    seek: (value) => command('seek', value),
    setVolume: (value) => command('volume', value),
    setSpeed: (value) => command('speed', value),
    setQueue(items, startIndex) {
      const item = items[startIndex] as AudioItem | undefined
      if (item) command('metadata', undefined, { ...item })
    },
    next: () => command('next'),
    previous: () => command('previous'),
    // Queue order, repeat and shuffle decisions remain in the existing JS store.
    setRepeatMode: () => {},
    setShuffle: () => {},
    setFavorite: (value) => command('favorite', value),
    updateNotificationLyricWithLayout: (value, inTitle) =>
      command('lyric', value, { inTitle }),
    updateNotificationLyric: (value) => command('lyric', value),
    getVolume: () => command('volumeQuery'),
    setEqualizerEnabled: (value) => command('equalizerEnabled', value),
    setEqualizerBand: (index, value) =>
      command('equalizerBand', value, { index }),
    dispose: () => {
      native.stop()
      local.clear()
    },
  }
  const audio = new NativeSongloftAudio(native, events)
  audio.on('sourceReady', () => finishSource?.(true))
  audio.on('error', () => finishSource?.(false))
  return Object.assign(audio, { currentSourceReady: () => sourceReady })
}
