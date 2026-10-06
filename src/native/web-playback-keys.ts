import { readLynxGlobal, readNativeModules } from './native-modules.js'
import { isWebPlatform } from './web-platform.js'

export type PlaybackKeyAction = 'toggle' | 'next' | 'previous' | 'volumeUp' | 'volumeDown'
export interface PlaybackKeyState {
  enabled: boolean
  blocked: boolean
  canPlay: boolean
  canNext: boolean
  canPrev: boolean
  volume: number
}
interface KeyboardPlatform { setPlaybackShortcuts?: (state: PlaybackKeyState) => void }

export function hasPlaybackKeys(): boolean {
  const module = readNativeModules()?.SongloftPlatform as KeyboardPlatform | undefined
  return isWebPlatform() && typeof module?.setPlaybackShortcuts === 'function'
}

export function configurePlaybackKeys(state: PlaybackKeyState): void {
  const module = readNativeModules()?.SongloftPlatform as KeyboardPlatform | undefined
  if (hasPlaybackKeys()) module!.setPlaybackShortcuts!(state)
}

export function subscribePlaybackKeys(listener: (action: PlaybackKeyAction) => void): () => void {
  const emitter = readLynxGlobal()?.getJSModule?.('GlobalEventEmitter')
  if (!hasPlaybackKeys() || typeof emitter?.addListener !== 'function'
    || typeof emitter?.removeListener !== 'function') return () => {}
  let active = true
  const handler = (value: unknown) => {
    const action = (value as { action?: unknown } | null)?.action
    if (active && (action === 'toggle' || action === 'next' || action === 'previous'
      || action === 'volumeUp' || action === 'volumeDown')) listener(action)
  }
  emitter.addListener('SongloftKeyboard.action', handler)
  return () => { active = false; emitter.removeListener('SongloftKeyboard.action', handler) }
}
