import { readLynxGlobal, readNativeModules } from './native-modules.js'
import { isWebPlatform } from './web-platform.js'
import { desktopConfig } from '../desktop/client.js'
import { desktopPlatformModule } from '../desktop/platform.js'
import { SHORTCUT_ACTIONS, parseShortcutBinding, type ShortcutAction, type ShortcutBinding, type ShortcutBindings } from '../features/player/domain/shortcut-bindings.js'

export type PlaybackKeyAction = ShortcutAction
export interface PlaybackKeyState {
  enabled: boolean
  blocked: boolean
  canPlay: boolean
  canNext: boolean
  canPrev: boolean
  volume: number
  bindings?: ShortcutBindings
  recording?: ShortcutAction | null
}
interface KeyboardPlatform { setPlaybackShortcuts?: (state: PlaybackKeyState) => void }

export function hasPlaybackKeys(): boolean {
  const module = desktopPlatformModule() ?? readNativeModules()?.SongloftPlatform as KeyboardPlatform | undefined
  return (isWebPlatform() || desktopConfig()?.capabilities.shortcuts === true) && typeof module?.setPlaybackShortcuts === 'function'
}

export function configurePlaybackKeys(state: PlaybackKeyState): void {
  const module = desktopPlatformModule() ?? readNativeModules()?.SongloftPlatform as KeyboardPlatform | undefined
  if (hasPlaybackKeys()) module!.setPlaybackShortcuts!(state)
}

export function subscribePlaybackKeys(listener: (action: PlaybackKeyAction) => void): () => void {
  const emitter = readLynxGlobal()?.getJSModule?.('GlobalEventEmitter')
  if (!hasPlaybackKeys() || typeof emitter?.addListener !== 'function'
    || typeof emitter?.removeListener !== 'function') return () => {}
  let active = true
  const handler = (value: unknown) => {
    const action = (value as { action?: unknown } | null)?.action
    if (active && SHORTCUT_ACTIONS.includes(action as ShortcutAction)) listener(action as ShortcutAction)
  }
  emitter.addListener('SongloftKeyboard.action', handler)
  return () => { active = false; emitter.removeListener('SongloftKeyboard.action', handler) }
}

export function subscribeShortcutRecording(listener: (action: ShortcutAction, binding: ShortcutBinding | null) => void): () => void {
  const emitter = readLynxGlobal()?.getJSModule?.('GlobalEventEmitter')
  if (!hasPlaybackKeys() || !emitter?.addListener || !emitter.removeListener) return () => {}
  const handler = (raw: unknown) => {
    const event = raw as { action?: unknown; binding?: unknown } | null
    if (SHORTCUT_ACTIONS.includes(event?.action as ShortcutAction)) listener(event!.action as ShortcutAction, parseShortcutBinding(event?.binding))
  }
  emitter.addListener('SongloftKeyboard.binding', handler)
  return () => emitter.removeListener('SongloftKeyboard.binding', handler)
}
