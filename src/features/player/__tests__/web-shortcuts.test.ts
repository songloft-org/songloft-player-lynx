import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { createMemoryStorage, setSongloftStorage } from '../../../core/storage/index.js'
import type { Song } from '../../../models/song.js'
import { clearBackHandlersForTests, pushBackHandler } from '../../../shared/nav/back-stack.js'
import { useAuthStore } from '../../auth/store/index.js'
import { usePlayerStore } from '../store/player-store.js'
import { currentPlaybackKeyState, initializeWebShortcuts, performPlaybackKey, PREF_WEB_SHORTCUTS, webShortcuts as useWebShortcuts } from '../data/web-shortcuts.js'

const originalPlayer = usePlayerStore.getState()
const originalAuth = useAuthStore.getState()
const g = globalThis as Record<string, unknown>
const configure = vi.fn()
const toggle = vi.fn(async () => {})
const next = vi.fn(async () => {})
const previous = vi.fn(async () => {})
const volume = vi.fn(async (value: number) => { usePlayerStore.setState({ volume: value }) })
let storage = createMemoryStorage()
let stop: (() => void) | undefined
let listeners: Set<(value: unknown) => void>

beforeEach(() => {
  storage = createMemoryStorage();setSongloftStorage(storage)
  clearBackHandlersForTests()
  useWebShortcuts.setState({ enabled: true })
  const song = { id: 1 } as Song
  usePlayerStore.setState({ ...originalPlayer, currentSong: song, playlist: [song, { id: 2 } as Song], currentIndex: 0,
    volume: 50, isBuffering: false, isAudioTrackSwitching: false, playMode: 'order',
    togglePlay: toggle, playNext: next, playPrev: previous, setVolume: volume })
  useAuthStore.setState({ status: 'authenticated' })
  g.SystemInfo = { platform: 'web' }
  g.NativeModules = { SongloftPlatform: { setPlaybackShortcuts: configure } }
  listeners = new Set()
  g.lynx = { getJSModule: () => ({
    addListener: (_name: string, fn: (value: unknown) => void) => listeners.add(fn),
    removeListener: (_name: string, fn: (value: unknown) => void) => listeners.delete(fn),
  }) }
})
afterEach(() => {
  stop?.();stop = undefined
  clearBackHandlersForTests()
  usePlayerStore.setState(originalPlayer, true);useAuthStore.setState(originalAuth, true)
  delete g.SystemInfo;delete g.NativeModules;delete g.lynx
  vi.restoreAllMocks();vi.clearAllMocks()
})

test('actions reuse player methods, clamp volume and respect order-mode end', async () => {
  for (const action of ['toggle', 'next', 'previous'] as const) await performPlaybackKey(action)
  expect(toggle).toHaveBeenCalledOnce();expect(next).toHaveBeenCalledOnce();expect(previous).toHaveBeenCalledOnce()
  usePlayerStore.setState({ volume: 99 })
  await performPlaybackKey('volumeUp');expect(volume).toHaveBeenLastCalledWith(100)
  usePlayerStore.setState({ volume: 1 })
  await performPlaybackKey('volumeDown');expect(volume).toHaveBeenLastCalledWith(0)
  usePlayerStore.setState({ currentIndex: 1 })
  expect(currentPlaybackKeyState().canNext).toBe(false)
  await performPlaybackKey('next');expect(next).toHaveBeenCalledOnce()
})

test('disabled, unauthenticated, buffering and active back-consuming layers reject actions', async () => {
  useWebShortcuts.setState({ enabled: false });await performPlaybackKey('toggle')
  useWebShortcuts.setState({ enabled: true });useAuthStore.setState({ status: 'unauthenticated' });await performPlaybackKey('toggle')
  useAuthStore.setState({ status: 'authenticated' });usePlayerStore.setState({ isBuffering: true });await performPlaybackKey('toggle')
  usePlayerStore.setState({ isBuffering: false });const remove = pushBackHandler(() => true);await performPlaybackKey('toggle');remove()
  expect(toggle).not.toHaveBeenCalled()
  await performPlaybackKey('toggle');expect(toggle).toHaveBeenCalledOnce()
})

test('next shortcut remains available at the queue end when manual priority is pending', async () => {
  usePlayerStore.setState({ currentIndex: 1, hasPriorityNext: true })
  expect(currentPlaybackKeyState().canNext).toBe(true)
  await performPlaybackKey('next')
  expect(next).toHaveBeenCalledOnce()
})

test('initialization hydrates disabled preference, deduplicates progress sync and disposes late events', async () => {
  await storage.prefs.set(PREF_WEB_SHORTCUTS, 'false')
  stop = await initializeWebShortcuts()
  expect(useWebShortcuts.getState().enabled).toBe(false)
  expect(configure).toHaveBeenCalledTimes(1)
  usePlayerStore.setState({ currentTime: 100 });expect(configure).toHaveBeenCalledTimes(1)
  useWebShortcuts.getState().setEnabled(true)
  expect(configure).toHaveBeenLastCalledWith(expect.objectContaining({ enabled: true }))
  const late = [...listeners][0]!
  stop();expect(listeners.size).toBe(0)
  late({ action: 'toggle' });await Promise.resolve();expect(toggle).not.toHaveBeenCalled()
})

test('duplicate startup leaves one listener and rapid writes preserve the final setting', async () => {
  stop = await initializeWebShortcuts()
  stop = await initializeWebShortcuts()
  expect(listeners.size).toBe(1)
  useWebShortcuts.getState().setEnabled(false)
  useWebShortcuts.getState().setEnabled(true)
  stop = await initializeWebShortcuts()
  expect(await storage.prefs.get(PREF_WEB_SHORTCUTS)).toBe('true')
  expect(useWebShortcuts.getState().enabled).toBe(true)
  for (const listener of listeners) listener({ action: 'toggle' })
  await vi.waitFor(() => expect(toggle).toHaveBeenCalledOnce())
})

test('a stale initial read cannot overwrite a user toggle or duplicate a newer install', async () => {
  let finish!: (value: string) => void
  vi.spyOn(storage.prefs, 'get').mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  const first = initializeWebShortcuts()
  await vi.waitFor(() => expect(finish).toBeTypeOf('function'))
  useWebShortcuts.getState().setEnabled(false)
  stop = await initializeWebShortcuts()
  finish('true');await first
  expect(useWebShortcuts.getState().enabled).toBe(false)
  expect(listeners.size).toBe(1)
})
