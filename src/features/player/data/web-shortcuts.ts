import { createStore } from 'zustand/vanilla'

import { getSongloftStorage } from '../../../core/storage/index.js'
import { configurePlaybackKeys, hasPlaybackKeys, subscribePlaybackKeys, subscribeShortcutRecording, type PlaybackKeyAction, type PlaybackKeyState } from '../../../native/web-playback-keys.js'
import { SEEK_STEP_MS, SHORTCUT_ACTIONS, bindingsOverlap, parseShortcutBindings, structuredDefaults, type ShortcutAction, type ShortcutBinding, type ShortcutBindings } from '../domain/shortcut-bindings.js'
import { getBackStackDepth, subscribeBackStack } from '../../../shared/nav/back-stack.js'
import { useAuthStore } from '../../auth/store/index.js'
import { hasNext } from '../store/derive.js'
import { usePlayerStore } from '../store/player-store.js'

export const PREF_WEB_SHORTCUTS = 'web_playback_shortcuts'
export const PREF_SHORTCUT_BINDINGS = 'web_shortcut_bindings'
let writes: Promise<void> = Promise.resolve()
let preferenceRevision = 0
let installGeneration = 0
let stopRuntime: (() => void) | undefined

interface ShortcutPreferences {
  enabled: boolean
  bindings: ShortcutBindings
  recording: ShortcutAction | null
  bindingError: boolean
  setEnabled: (enabled: boolean) => void
}
export const webShortcuts = createStore<ShortcutPreferences>((set) => ({
  enabled: true,
  bindings: structuredDefaults(),
  recording: null,
  bindingError: false,
  setEnabled: enabled => {
    preferenceRevision++
    set({ enabled })
    const storage = getSongloftStorage()
    writes = writes.then(() => storage.prefs.set(PREF_WEB_SHORTCUTS, String(enabled))).catch(() => {})
  },
}))

export function setShortcutBinding(action: ShortcutAction, binding: ShortcutBinding): boolean {
  const current = webShortcuts.getState().bindings
  if (SHORTCUT_ACTIONS.some(other => other !== action && bindingsOverlap(current[other], binding))) return false
  saveBindings({ ...current, [action]: binding })
  return true
}

function saveBindings(bindings: ShortcutBindings): void {
  preferenceRevision++
  webShortcuts.setState({ bindings, recording: null, bindingError: false })
  const storage = getSongloftStorage()
  writes = writes.then(() => storage.prefs.set(PREF_SHORTCUT_BINDINGS, JSON.stringify(bindings))).catch(() => {})
}

export function resetShortcutBindings(): void { saveBindings(structuredDefaults()) }

export function currentPlaybackKeyState(): PlaybackKeyState {
  const player = usePlayerStore.getState()
  const canPlay = useAuthStore.getState().status === 'authenticated'
    && player.currentSong != null && player.playlist.length > 0
    && !player.isBuffering && !player.isAudioTrackSwitching
  return {
    enabled: webShortcuts.getState().enabled,
    blocked: getBackStackDepth() > 0,
    canPlay,
    canNext: canPlay && hasNext(player),
    // Previous can restart the current track even without a previous item.
    canPrev: canPlay,
    volume: player.volume,
    bindings: webShortcuts.getState().bindings,
    recording: webShortcuts.getState().recording,
  }
}

export async function performPlaybackKey(action: PlaybackKeyAction): Promise<void> {
  const allowed = currentPlaybackKeyState()
  if (!allowed.enabled || allowed.blocked || !allowed.canPlay || allowed.recording) return
  const player = usePlayerStore.getState()
  if (action === 'toggle') await player.togglePlay()
  else if (action === 'next' && allowed.canNext) await player.playNext()
  else if (action === 'previous') await player.playPrev()
  else if (action === 'seekForward' || action === 'seekBackward') await player.seekBy(action === 'seekForward' ? SEEK_STEP_MS : -SEEK_STEP_MS)
  else if (action === 'mute') await player.toggleMute()
  else if (action === 'volumeUp' || action === 'volumeDown') {
    if ((action === 'volumeUp' && player.volume >= 100) || (action === 'volumeDown' && player.volume <= 0)) return
    await player.setVolume(Math.min(100, Math.max(0, player.volume + (action === 'volumeUp' ? 5 : -5))))
  }
}

/** Duplicate startup disposes the previous listener; stale preference reads cannot reinstall it. */
export async function initializeWebShortcuts(): Promise<() => void> {
  const expected = ++installGeneration
  const revision = preferenceRevision
  stopRuntime?.()
  if (!hasPlaybackKeys()) return () => {}
  let saved: string | null = null
  let savedBindings: string | null = null
  try {
    await writes
    saved = await getSongloftStorage().prefs.get(PREF_WEB_SHORTCUTS)
    savedBindings = await getSongloftStorage().prefs.get(PREF_SHORTCUT_BINDINGS)
  } catch { /* Default on. */ }
  if (expected !== installGeneration) return () => {}
  if (revision === preferenceRevision) {
    let parsed: unknown
    try { parsed = savedBindings ? JSON.parse(savedBindings) : null } catch { parsed = null }
    webShortcuts.setState({ enabled: saved !== 'false', bindings: parseShortcutBindings(parsed), recording: null })
  }
  let alive = true
  let lastState = ''
  let queue: Promise<void> = Promise.resolve()
  const sync = () => {
    if (!alive) return
    const state = currentPlaybackKeyState()
    const serialized = JSON.stringify(state)
    if (serialized === lastState) return
    lastState = serialized
    configurePlaybackKeys(state)
  }
  const unsubscribe = [
    usePlayerStore.subscribe(sync), useAuthStore.subscribe(sync),
    webShortcuts.subscribe(sync), subscribeBackStack(sync),
    subscribeShortcutRecording((action, binding) => {
      if (webShortcuts.getState().recording !== action) return
      if (binding && !setShortcutBinding(action, binding)) webShortcuts.setState({ bindingError: true })
      webShortcuts.setState({ recording: null })
    }),
    subscribePlaybackKeys(action => {
      queue = queue.then(() => alive ? performPlaybackKey(action) : undefined).catch(() => {})
    }),
  ]
  sync()
  const stop = () => {
    if (!alive) return
    alive = false
    unsubscribe.forEach(fn => fn())
    configurePlaybackKeys({ ...currentPlaybackKeyState(), enabled: false })
    if (stopRuntime === stop) stopRuntime = undefined
  }
  stopRuntime = stop
  return stop
}
