import '../../../shims/router-env.js'

import '@testing-library/jest-dom'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { act, fireEvent, getQueriesForElement, render } from '@lynx-js/react/testing-library'

/**
 * The Web branch of PluginWebViewPage: placeholder + main-thread iframe.
 *
 * On Web there is no `<webview>` element, so the page renders a placeholder and
 * drives `NativeModules.SongloftWebview` instead. Placement itself lives on the
 * main thread (it resolves the placeholder selector inside lynx-view's shadow
 * root), so these tests never mock any measurement — they pin:
 *
 *  - the two shells: a `?tab=true` entry renders chromeless with an `embed`
 *    URL (Flutter's plugin_tab_page), a pushed entry keeps the topbar with the
 *    open-in-browser action and drops `embed` (Flutter's plugin_webview_page);
 *  - `open` is called with the plugin URL and the placeholder selector;
 *  - a plugin host call gets a `songloft-host-reply` carrying the same id;
 *  - an `openFailed` notice degrades to the unavailable message;
 *  - unmounting HIDES the iframe (never closes it) and detaches the bridge
 *    handlers — detaching the frame is what crashed the renderer, see
 *    docs/archive/web-plugin-tab-crash.md.
 */
const h = vi.hoisted(() => ({
  open: vi.fn(),
  postMessage: vi.fn(),
  hide: vi.fn(),
  close: vi.fn(),
  available: true,
  // `?tab=true` in the search string for this test.
  tab: false,
  handlerCalls: [] as Array<{
    onMessage: (payload: unknown) => void
    onOpenFailed: () => void
  } | null>,
  openURL: vi.fn(),
  // The player-store double: subscribe captures listeners so the state-push
  // path is testable, getState feeds playerStateToJson on host calls.
  playerState: {
    playlist: [] as unknown[],
    currentIndex: 0,
    currentSong: null,
    isPlaying: false,
    currentTime: 0,
    volume: 80,
    playMode: 'order',
    sourcePlaylistId: null,
  },
  playerSubs: [] as Array<(state: unknown, prev: unknown) => void>,
}))

vi.mock('react-i18next', async () =>
  (await import('../../../__tests__/_render-mocks.js')).mockReactI18next(),
)

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => () => {},
  useParams: () => ({ entryPath: 'lx' }),
  useSearch: () => ({ tab: h.tab }),
}))

vi.mock('../../../native/web-platform.js', () => ({
  isWebPlatform: () => true,
}))

vi.mock('../../../native/web-webview.js', () => ({
  getWebviewModule: () => ({
    available: h.available,
    open: h.open,
    hide: h.hide,
    postMessage: h.postMessage,
    close: h.close,
  }),
  setWebviewBridgeHandlers: (handlers: unknown) => {
    h.handlerCalls.push(handlers as never)
  },
}))

vi.mock('../../../native/native-platform.js', () => ({
  openURL: h.openURL,
}))

vi.mock('../../../core/storage/index.js', () => ({
  getSongloftStorage: () => ({
    secure: { get: async () => 'token-123' },
  }),
}))

vi.mock('../data/jsplugin-query.js', () => ({
  usePluginsQuery: () => ({
    data: { plugins: [{ id: 1, entryPath: 'lx', displayName: 'LX Music' }] },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
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

const { PluginWebViewPage } = await import('../pages/PluginWebViewPage.js')

/** The last registered non-null bridge handlers (the page's live set). */
function activeHandlers() {
  const found = [...h.handlerCalls].reverse().find((x) => x != null)
  if (!found) throw new Error('no bridge handlers were registered')
  return found
}

beforeEach(() => {
  h.tab = false
  h.available = true
  h.handlerCalls = []
  h.playerSubs = []
})

afterEach(() => {
  vi.clearAllMocks()
  h.handlerCalls = []
  h.playerSubs = []
})

async function renderPage() {
  const result = render(<PluginWebViewPage />)
  // Flush the token effect (async storage read → setSrc → the Web branch).
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
  const q = getQueriesForElement(result.container as unknown as HTMLElement)
  return { ...result, q }
}

test('a pushed entry renders the topbar with the open-in-browser action', async () => {
  const { q } = await renderPage()
  expect(q.getByTestId('plugin-webview-back')).toBeTruthy()
  expect(q.getByTestId('plugin-webview-open')).toBeTruthy()
  expect(q.getByTestId('plugin-webview-frame')).toBeTruthy()
})

test('a pushed entry drops `embed` from the plugin URL (plugin keeps its toolbar)', async () => {
  await renderPage()
  expect(h.open).toHaveBeenCalledTimes(1)
  const [url, selector] = h.open.mock.calls[0] as [string, string]
  expect(url).toContain('/api/v1/jsplugin/lx/')
  expect(url).not.toContain('embed')
  expect(url).toContain('access_token=token-123')
  expect(selector).toBe('#plugin-webview-frame')
})

test('the open-in-browser action opens the plain URL externally', async () => {
  const { q } = await renderPage()
  await act(async () => {
    fireEvent.tap(q.getByTestId('plugin-webview-open'))
  })
  expect(h.openURL).toHaveBeenCalledTimes(1)
  const url = h.openURL.mock.calls[0][0] as string
  expect(url).toContain('/api/v1/jsplugin/lx/')
  expect(url).not.toContain('embed')
})

test('a tab entry renders chromeless with an embed URL', async () => {
  h.tab = true
  const { q } = await renderPage()
  expect(q.queryByTestId('plugin-webview-back')).toBeNull()
  expect(q.queryByTestId('plugin-webview-open')).toBeNull()
  expect(q.getByTestId('plugin-webview-frame')).toBeTruthy()
  expect(h.open).toHaveBeenCalledTimes(1)
  const [url] = h.open.mock.calls[0] as [string, string]
  expect(url).toContain('embed')
})

test('replies to a plugin host call with the same correlation id', async () => {
  await renderPage()
  const before = h.postMessage.mock.calls.length
  await act(async () => {
    activeHandlers().onMessage({
      type: 'songloft-host-call',
      id: 'c1',
      ns: 'host',
      method: 'getInfo',
    })
    await Promise.resolve()
  })
  expect(h.postMessage.mock.calls.length, 'exactly one reply').toBe(before + 1)
  const reply = JSON.parse(h.postMessage.mock.calls.at(-1)![0] as string)
  expect(reply).toMatchObject({ type: 'songloft-host-reply', id: 'c1', ok: true })
  expect(reply.data).toMatchObject({ platform: 'lynx' })
})

test('a message that is not a host call is ignored', async () => {
  await renderPage()
  const before = h.postMessage.mock.calls.length
  await act(async () => {
    activeHandlers().onMessage({ type: 'songloft-theme', theme: 'dark' })
    await Promise.resolve()
  })
  expect(h.postMessage.mock.calls.length).toBe(before)
})

test('an openFailed notice degrades to the unavailable message', async () => {
  // The main thread polled for the placeholder and never found it (e.g. the
  // id drifted) — the page must say so rather than show a silent blank area.
  const { q } = await renderPage()
  act(() => {
    activeHandlers().onOpenFailed()
  })
  expect(q.getByText(/This plugin requires the native app/)).toBeTruthy()
})

/*
 * Leaving the page must HIDE, not close. `close` detaches the iframe, and that
 * detach is what took the Chrome renderer down with error code 11 (reproduced
 * 15/15 with an all-frames extension + DevTools open, 0/5 once the frame stays
 * attached). It also means re-entering the tab restores the plugin's own state
 * instead of reloading it. Real teardown belongs to the plugin manager and the
 * logout path — never to a tab switch.
 */
/*
 * The frame is kept alive, so entering the page does not reload the plugin — and
 * the theme / player subscriptions do not exist while it is off screen. Without a
 * push on entry a plugin shows whatever it last heard before being hidden.
 */
test('entering the page pushes the current theme and player state', async () => {
  await renderPage()
  const types = h.postMessage.mock.calls.map((c) => JSON.parse(c[0] as string).type)
  expect(types).toContain('songloft-theme')
  expect(types).toContain('songloft-player-state')
})

test('unmount hides the iframe, never closes it, and detaches the handlers', async () => {
  const result = await renderPage()
  // The library's own afterEach cleanup may already have hidden a previous
  // render's frame by the time this test starts; what matters is that THIS
  // unmount hides one more and detaches the handlers.
  const before = h.hide.mock.calls.length
  result.unmount()
  expect(h.hide.mock.calls.length).toBeGreaterThan(before)
  // The plugin's `entryPath` is the keep-alive key the host frames are stored by.
  expect(h.hide).toHaveBeenLastCalledWith('lx')
  expect(h.close, 'a tab switch must never tear the frame down').not.toHaveBeenCalled()
  expect(h.handlerCalls.at(-1)).toBeNull()
})

test('a missing SongloftWebview module falls back to the unavailable message', async () => {
  // A stale host page that predates the module registers nothing — the page
  // must say so rather than show a silent blank area.
  h.available = false
  const { q } = await renderPage()
  expect(q.getByText(/This plugin requires the native app/)).toBeTruthy()
  expect(h.open).not.toHaveBeenCalled()
})
