import '../../../shims/router-env.js'

import '@testing-library/jest-dom'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { act, render } from '@lynx-js/react/testing-library'

/**
 * The Web branch of LynxPluginFrame: placeholder + nested `<lynx-view>`.
 *
 * What these pin, and why each one exists:
 *
 *  - **The initial player state travels in `globalProps`.** It used to be gated on
 *    a `loaded` flag set from the native `<frame>`'s `bindload` — an event the Web
 *    branch never fires, because it renders a placeholder `<view>`. So on Web the
 *    player-state subscription was never installed and the child learned nothing
 *    about playback, ever. The push channel only carries *changes*, so the current
 *    snapshot has to arrive some other way; `globalProps` is the one delivery the
 *    host guarantees (set before `url`, and merged again on every `open`).
 *  - **Leaving the page hides the child, never closes it.** Detaching a plugin
 *    frame is what crashed the renderer — see
 *    docs/archive/web-plugin-tab-crash.md.
 *  - **The plugin key travels with every lifecycle call**, because the host keeps
 *    one child alive per plugin.
 */
const h = vi.hoisted(() => ({
  open: vi.fn(),
  updateGlobalProps: vi.fn(),
  sendEvent: vi.fn(),
  hostReply: vi.fn(),
  hide: vi.fn(),
  close: vi.fn(),
  available: true,
  handlerCalls: [] as unknown[],
  themeSubs: [] as Array<() => void>,
  playerState: {
    playlist: [{ id: 7, title: 'Song', artist: 'A' }] as unknown[],
    currentIndex: 0,
    currentSong: { id: 7, title: 'Song' },
    isPlaying: true,
    currentTime: 0,
    volume: 80,
    playMode: 'order',
    sourcePlaylistId: null,
  },
  playerSubs: [] as Array<(state: unknown, prev: unknown) => void>,
}))

vi.mock('../../../native/web-platform.js', () => ({
  isWebPlatform: () => true,
}))

vi.mock('../../../native/web-lynx-frame.js', () => ({
  getLynxFrameModule: () => ({
    available: h.available,
    open: h.open,
    updateGlobalProps: h.updateGlobalProps,
    sendEvent: h.sendEvent,
    hostReply: h.hostReply,
    hide: h.hide,
    close: h.close,
  }),
  setLynxFrameBridgeHandlers: (handlers: unknown) => { h.handlerCalls.push(handlers) },
}))

vi.mock('../../../shared/theme/theme-model.js', () => ({
  getAppTheme: () => 'dark',
  resolveTheme: () => 'dark',
  subscribeAppTheme: (fn: () => void) => {
    h.themeSubs.push(fn)
    return () => {}
  },
}))

vi.mock('../../player/store/index.js', () => {
  const usePlayerStore = Object.assign(() => ({}), {
    getState: () => h.playerState,
    subscribe: (fn: (state: unknown, prev: unknown) => void) => {
      h.playerSubs.push(fn)
      return () => {}
    },
  })
  return { usePlayerStore }
})

vi.mock('../api/index.js', () => ({
  getJSPluginApi: () => ({ client: { get: async () => ({ data: null }) } }),
}))

const { LynxPluginFrame } = await import('../widgets/LynxPluginFrame.js')

beforeEach(() => {
  h.available = true
  h.handlerCalls = []
  h.themeSubs = []
  h.playerSubs = []
})
afterEach(() => {
  vi.clearAllMocks()
  h.handlerCalls = []
  h.playerSubs = []
})

async function renderFrame() {
  const result = render(<LynxPluginFrame entryPath='alpha' isTabEntry={true} />)
  await act(async () => { await Promise.resolve() })
  return result
}

/** The globalProps JSON the component handed to the host on `open`. */
function openedProps(): Record<string, unknown> {
  expect(h.open).toHaveBeenCalled()
  const [, , propsJson] = h.open.mock.calls[0] as [string, string, string, string]
  return JSON.parse(propsJson) as Record<string, unknown>
}

test('open carries the bundle URL, the placeholder selector and the plugin key', async () => {
  await renderFrame()
  const [url, selector, , key] = h.open.mock.calls[0] as [string, string, string, string]
  expect(url).toContain('/api/v1/jsplugin/alpha/static/main.web.bundle')
  expect(selector).toBe('#plugin-lynx-frame')
  // The key is what the host keeps one live child per — see webview-host.js.
  expect(key).toBe('alpha')
})

/*
 * The regression this file exists for. Before, `playerState` was absent and the
 * subscription that would have sent it was gated behind an event Web never fires.
 */
test('the initial player state is delivered in globalProps', async () => {
  await renderFrame()
  const props = openedProps()
  expect(props['playerState'], 'the child boots without knowing what is playing')
    .toBeTruthy()
  const state = props['playerState'] as Record<string, unknown>
  expect(state['is_playing']).toBe(true)
  expect(state['current_song']).toMatchObject({ id: 7 })
})

test('globalProps also carries the theme, frameId and embed flag', async () => {
  await renderFrame()
  const props = openedProps()
  expect(props['theme']).toBe('dark')
  expect(props['embed']).toBe(true)
  expect(String(props['frameId'])).toContain('alpha')
})

test('player-state changes are pushed to the child', async () => {
  await renderFrame()
  expect(h.playerSubs.length, 'no subscription means no pushes ever').toBeGreaterThan(0)
  act(() => {
    for (const fn of h.playerSubs) {
      fn(
        { ...h.playerState, isPlaying: false },
        { ...h.playerState, isPlaying: true },
      )
    }
  })
  expect(h.sendEvent).toHaveBeenCalled()
  const [name, payload] = h.sendEvent.mock.calls[0] as [string, string]
  expect(name).toBe('SongloftPluginBridge.push')
  expect(JSON.parse(payload)).toMatchObject({ event: 'playerState' })
})

test('an unchanged player-state signature is not pushed', async () => {
  await renderFrame()
  act(() => {
    for (const fn of h.playerSubs) fn({ ...h.playerState }, { ...h.playerState })
  })
  expect(h.sendEvent).not.toHaveBeenCalled()
})

test('a theme change is pushed as merged globalProps', async () => {
  await renderFrame()
  act(() => { for (const fn of h.themeSubs) fn() })
  expect(h.updateGlobalProps).toHaveBeenCalled()
  expect(JSON.parse(h.updateGlobalProps.mock.calls[0]![0] as string)).toMatchObject({
    theme: 'dark',
  })
})

test('unmount hides the child, never closes it, and detaches the handlers', async () => {
  const result = await renderFrame()
  result.unmount()
  expect(h.hide).toHaveBeenLastCalledWith('alpha')
  expect(h.close, 'a tab switch must never detach the child').not.toHaveBeenCalled()
  expect(h.handlerCalls.at(-1)).toBeNull()
})

test('an unavailable module is a no-op rather than a crash', async () => {
  h.available = false
  await renderFrame()
  expect(h.open).not.toHaveBeenCalled()
})
