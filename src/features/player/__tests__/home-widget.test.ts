import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { getQueryClient } from '../../../lib/query/index.js'
import type { Song } from '../../../models/song.js'
import { useAuthStore } from '../../auth/store/index.js'
import { usePlayerStore } from '../store/player-store.js'
import {
  currentHomeWidgetSnapshot,
  initializeHomeWidget,
  performWidgetAction,
} from '../data/home-widget.js'

const favorite = vi.hoisted(() => ({
  toggle: vi.fn(async (_id: number) => true),
  read: vi.fn(async (_id: number) => false),
}))
// Widget commands are tested without a server session. A restored local song
// now also loads saved lyrics, so keep that request out of the auth lifecycle.
vi.mock('../data/lyric-source.js', () => ({
  defaultLyricFetcher: vi.fn(async () => ({})),
}))
vi.mock('../../library/data/favorites.js', () => ({
  toggleFavoriteNonReact: favorite.toggle,
  getFavoriteState: favorite.read,
}))
const originalPlayer = usePlayerStore.getState()
const originalAuth = useAuthStore.getState()
const update = vi.fn()
const toggle = vi.fn(async () => {})
const next = vi.fn(async () => {})
const previous = vi.fn(async () => {})
const handlers = new Map<string, (event: { action: string }) => void>()
let coldAction = ''
let stop: (() => void) | undefined

beforeEach(() => {
  vi.stubGlobal('NativeModules', {
    SongloftPlatform: {
      updateHomeWidget: update,
      consumeWidgetAction: (reply: (action: string) => void) => reply(coldAction),
    },
  })
  vi.stubGlobal('lynx', {
    getJSModule: () => ({
      addListener: (name: string, handler: (event: { action: string }) => void) =>
        handlers.set(name, handler),
      removeListener: (name: string) => handlers.delete(name),
    }),
  })
  const song = { id: 7, title: '星河', artist: '测试', type: 'local' } as Song
  useAuthStore.setState({ status: 'authenticated' })
  usePlayerStore.setState({
    ...originalPlayer,
    currentSong: song,
    playlist: [song, { ...song, id: 8 }],
    currentIndex: 0,
    isPlaying: true,
    playMode: 'order',
    togglePlay: toggle,
    playNext: next,
    playPrev: previous,
  })
  getQueryClient().setQueryData(['favorites', 'songIds'], new Set([7]))
})
afterEach(() => {
  stop?.()
  stop = undefined
  coldAction = ''
  handlers.clear()
  usePlayerStore.setState(originalPlayer, true)
  useAuthStore.setState(originalAuth, true)
  getQueryClient().clear()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

test('metadata/transport/favorites update the snapshot; progress ticks do not write native storage', async () => {
  stop = initializeHomeWidget(vi.fn())
  await Promise.resolve()
  expect(currentHomeWidgetSnapshot()).toMatchObject({
    title: '星河',
    isPlaying: true,
    isFavorite: true,
    hasSong: true,
  })
  const writes = update.mock.calls.length
  usePlayerStore.setState({ currentTime: 1234 })
  expect(update).toHaveBeenCalledTimes(writes)
  usePlayerStore.setState({ isPlaying: false })
  expect(JSON.parse(update.mock.calls.at(-1)![0])).toMatchObject({ isPlaying: false })
  useAuthStore.setState({ status: 'unauthenticated' })
  expect(JSON.parse(update.mock.calls.at(-1)![0])).toMatchObject({
    hasSong: false,
    title: '',
    coverUrl: '',
    isPlaying: false,
  })
})

test('cold and warm actions use the existing queue, and disposal removes delivery', async () => {
  coldAction = 'toggle'
  const open = vi.fn()
  stop = initializeHomeWidget(open)
  await vi.waitFor(() => expect(toggle).toHaveBeenCalledOnce())
  handlers.get('SongloftWidget.action')!({ action: 'next' })
  handlers.get('SongloftWidget.action')!({ action: 'previous' })
  handlers.get('SongloftWidget.action')!({ action: 'open' })
  await vi.waitFor(() => expect(previous).toHaveBeenCalledOnce())
  expect(next).toHaveBeenCalledOnce()
  expect(open).toHaveBeenCalledOnce()
  const handler = handlers.get('SongloftWidget.action')!
  stop()
  handler({ action: 'toggle' })
  await Promise.resolve()
  expect(toggle).toHaveBeenCalledOnce()
  expect(handlers.size).toBe(0)
})

test('favorite refreshes even without a mounted query observer; logged-out and switching queues reject commands', async () => {
  await performWidgetAction('favorite')
  expect(favorite.toggle).toHaveBeenCalledWith(7)
  expect(favorite.read).toHaveBeenCalledWith(7)
  usePlayerStore.setState({ isAudioTrackSwitching: true })
  await performWidgetAction('next')
  expect(next).not.toHaveBeenCalled()
  useAuthStore.setState({ status: 'unauthenticated' })
  await performWidgetAction('toggle')
  expect(toggle).not.toHaveBeenCalled()
})

test('older shells skip widget initialization without subscriptions or bridge errors', () => {
  vi.stubGlobal('NativeModules', { SongloftPlatform: {} })
  stop = initializeHomeWidget(vi.fn())
  expect(update).not.toHaveBeenCalled()
  expect(handlers.size).toBe(0)
})
