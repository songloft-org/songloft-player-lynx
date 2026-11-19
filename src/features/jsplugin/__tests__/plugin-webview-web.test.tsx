import '../../../shims/router-env.js'

import '@testing-library/jest-dom'
import { runInNewContext } from 'node:vm'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { act, fireEvent, getQueriesForElement, render } from '@lynx-js/react/testing-library'
import { clearBackHandlersForTests, dispatchBack, pushBackHandler } from '../../../shared/nav/back-stack.js'

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
  continueBack: vi.fn(),
  available: true,
  isWeb: true,
  managed: false,
  renderEngine: 'webview',
  // `?tab=true` in the search string for this test.
  tab: false,
  handlerCalls: [] as Array<{
    onMessage: (payload: unknown) => void
    onOpenFailed: () => void
    onLoad?: () => void
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
    duration: 0,
    volume: 80,
    playMode: 'order',
    sourcePlaylistId: null,
  },
  playerSubs: [] as Array<(state: unknown, prev: unknown) => void>,
  // Theme/pack subscription capture — the appearance re-push paths.
  themeSubs: [] as Array<() => void>,
  packSubs: [] as Array<() => void>,
  activePack: null as null | { themeId: string; data: Record<string, unknown> },
  policySubs: new Set<() => void>(),
  materialSubs: new Set<() => void>(),
  policy: { reduceTransparency: false, increaseContrast: false, opaque: false },
  variant: 'regular' as 'regular' | 'ultra-thin' | 'thin' | 'thick',
}))

vi.mock('react-i18next', async () =>
  (await import('../../../__tests__/_render-mocks.js')).mockReactI18next(),
)

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => () => { },
  useParams: () => ({ entryPath: 'lx' }),
  useSearch: () => ({ tab: h.tab }),
}))

vi.mock('../../../native/web-platform.js', () => ({
  isWebPlatform: () => h.isWeb,
}))

vi.mock('../../../core/navigation/back-controller.js', () => ({ continueHostBack: h.continueBack }))

vi.mock('../../../shared/theme/theme-model.js', () => ({
  getAppTheme: () => 'light',
  resolveTheme: () => 'light',
  subscribeAppTheme: (fn: () => void) => {
    h.themeSubs.push(fn)
    return () => { }
  },
}))

vi.mock('../../../shared/theme/theme-pack-model.js', () => ({
  getActiveThemePack: () => h.activePack,
  subscribeActiveThemePack: (fn: () => void) => {
    h.packSubs.push(fn)
    return () => { }
  },
}))

vi.mock('../../../shared/theme/material-model.js', () => ({
  getMaterialVariant: () => h.variant,
  subscribeMaterialVariant: (fn: () => void) => {
    h.materialSubs.add(fn)
    return () => h.materialSubs.delete(fn)
  },
}))

vi.mock('../../../shared/theme/surface-policy.js', () => ({
  getSurfacePolicy: () => h.policy,
  subscribeSurfacePolicy: (fn: () => void) => {
    h.policySubs.add(fn)
    return () => h.policySubs.delete(fn)
  },
}))

vi.mock('../../../native/web-webview.js', async () => {
  const actual = await vi.importActual<typeof import('../../../native/web-webview.js')>(
    '../../../native/web-webview.js',
  )
  return {
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
    // The real module's event-name constants — the mock above never wires the
    // listeners, so these are only referenced by types here.
    WEBVIEW_MESSAGE_EVENT: actual.WEBVIEW_MESSAGE_EVENT,
    WEBVIEW_OPEN_FAILED_EVENT: actual.WEBVIEW_OPEN_FAILED_EVENT,
    WEBVIEW_LOAD_EVENT: actual.WEBVIEW_LOAD_EVENT,
  }
})

vi.mock('../../../native/native-platform.js', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../../native/native-platform.js')>(),
  openURL: h.openURL,
}))

vi.mock('../widgets/RetainedPluginTabs.js', () => ({
  useRetainedPluginTabs: () => h.managed,
}))

vi.mock('../../../core/storage/index.js', () => ({
  getSongloftStorage: () => ({
    secure: { get: async () => 'token-123' },
  }),
}))

vi.mock('../data/jsplugin-query.js', () => ({
  usePluginsQuery: () => ({
    data: {
      plugins: [{
        id: 1,
        entryPath: 'lx',
        displayName: 'LX Music',
        renderEngine: h.renderEngine,
        isActive: true,
      }],
    },
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
      return () => { }
    },
  })
  return { usePlayerStore }
})

const { PluginWebViewPage } = await import('../pages/PluginWebViewPage.js')
const { APP_RESUMED_EVENT } = await import('../../../native/app-lifecycle.js')

/** The last registered non-null bridge handlers (the page's live set). */
function activeHandlers() {
  const found = [...h.handlerCalls].reverse().find((x) => x != null)
  if (!found) throw new Error('no bridge handlers were registered')
  return found
}

beforeEach(() => {
  clearBackHandlersForTests()
  h.tab = false
  h.available = true
  h.isWeb = true
  h.managed = false
  h.renderEngine = 'webview'
  h.handlerCalls = []
  h.playerSubs = []
  h.themeSubs = []
  h.packSubs = []
  h.activePack = null
  h.policySubs.clear()
  h.materialSubs.clear()
  h.policy = { reduceTransparency: false, increaseContrast: false, opaque: false }
  h.variant = 'regular'
})

afterEach(() => {
  clearBackHandlersForTests()
  vi.restoreAllMocks()
  vi.clearAllMocks()
  h.handlerCalls = []
  h.playerSubs = []
  h.themeSubs = []
  h.packSubs = []
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

function nativeHost() {
  const listeners = new Set<() => void>()
  const emitter = lynx.getJSModule('GlobalEventEmitter')
  const addListener = emitter.addListener.bind(emitter)
  const removeListener = emitter.removeListener.bind(emitter)
  vi.spyOn(emitter, 'addListener').mockImplementation((name, fn) => {
    if (name === APP_RESUMED_EVENT) listeners.add(fn as () => void)
    else addListener(name, fn)
  })
  vi.spyOn(emitter, 'removeListener').mockImplementation((name, fn) => {
    if (name === APP_RESUMED_EVENT) listeners.delete(fn as () => void)
    else removeListener(name, fn)
  })
  const invoke = vi.fn((_params: { method: string; params: { func: string } }) => ({ exec: vi.fn() }))
  vi.spyOn(lynx, 'createSelectorQuery').mockReturnValue({
    select: () => ({ invoke }),
  } as unknown as ReturnType<typeof lynx.createSelectorQuery>)
  return { listeners, invoke, resume: () => listeners.forEach(fn => fn()) }
}

test('Android resume reaches the mounted WebView and not an unmounted plugin', async () => {
  h.isWeb = false
  const host = nativeHost()
  const { q, unmount } = await renderPage()
  expect(q.getByTestId('plugin-webview-frame')).toBeTruthy()
  expect(host.listeners.size).toBe(1)
  host.invoke.mockClear()
  act(() => host.resume())
  expect(host.invoke).toHaveBeenCalledTimes(1)
  const call = host.invoke.mock.calls[0]![0] as unknown as { method: string; params: { func: string } }
  expect(call.method).toBe('eval')
  const frames: Array<() => void> = []
  const events: Event[] = []
  runInNewContext(call.params.func, {
    requestAnimationFrame: (fn: () => void) => frames.push(fn),
    document: { dispatchEvent: (event: Event) => events.push(event) },
    Event,
  })
  expect(events).toHaveLength(0)
  frames.forEach(fn => fn())
  expect(events.map(event => event.type)).toEqual(['visibilitychange'])
  act(() => { unmount() })
  host.resume()
  expect(host.listeners.size).toBe(0)
  expect(host.invoke).toHaveBeenCalledTimes(1)
})

test('Web iframe pages leave browser visibility handling to the iframe', async () => {
  const host = nativeHost()
  await renderPage()
  host.resume()
  expect(host.listeners.size).toBe(0)
  expect(host.invoke).not.toHaveBeenCalled()
})

test('a pushed entry renders the topbar with the open-in-browser action', async () => {
  const { q } = await renderPage()
  expect(q.getByTestId('plugin-webview-back')).toBeTruthy()
  expect(q.getByTestId('plugin-webview-open')).toBeTruthy()
  expect(q.getByTestId('plugin-webview-frame')).toBeTruthy()
})

test('a retained home entry renders only its topbar while the shell owns the frame', async () => {
  h.isWeb = false
  h.managed = true
  h.renderEngine = 'lynx'
  const { q, container } = await renderPage()
  expect(q.getByTestId('plugin-webview-title').textContent).toBe('LX Music')
  expect(q.getByTestId('plugin-webview-back')).toBeTruthy()
  expect(q.getByTestId('plugin-webview-open')).toBeTruthy()
  expect(q.queryByTestId('plugin-lynx-frame')).toBeNull()
  expect(container.querySelector('.plugin-webview')).toBeNull()
  fireEvent.tap(q.getByTestId('plugin-webview-open'))
  expect(h.openURL).toHaveBeenCalledWith(
    expect.stringContaining('/jsplugin/lx/'),
  )
  expect(h.open).not.toHaveBeenCalled()
})

test('a retained tab entry leaves all available body space to its existing frame', async () => {
  h.isWeb = false
  h.managed = true
  h.renderEngine = 'lynx'
  h.tab = true
  const { q, container } = await renderPage()
  expect(q.queryByTestId('plugin-webview-back')).toBeNull()
  expect(q.queryByTestId('plugin-lynx-frame')).toBeNull()
  expect(container.querySelector('.plugin-webview')).toBeNull()
  expect(h.open).not.toHaveBeenCalled()
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
  expect(reply.data).toMatchObject({ platform: 'web', version: expect.any(String) })
})

test('native WebView sends correlated success/error replies and excludes the marker from external URLs', async () => {
  h.isWeb = false
  const host = nativeHost()
  const { q, unmount } = await renderPage()
  const frame = q.getByTestId('plugin-webview-frame')
  expect(frame.getAttribute('src')).toContain('songloft_host=lynx')
  fireEvent.tap(q.getByTestId('plugin-webview-open'))
  expect(h.openURL.mock.calls.at(-1)![0]).not.toContain('songloft_host')
  const send = (payload: unknown) => {
    const event = frame.ownerDocument.createEvent('Event')
    event.initEvent('bindEvent:message', false, false)
    Object.assign(event, { eventType: 'bindEvent', eventName: 'message', detail: { msg: JSON.stringify(payload) } })
    frame.dispatchEvent(event)
  }
  host.invoke.mockClear()
  await act(async () => {
    send({ type: 'songloft-host-call', id: 'native-1', ns: 'host', method: 'getInfo', params: null })
    await Promise.resolve()
  })
  const replies: Array<{ data: unknown }> = []
  const browser = { window: { dispatchEvent: (event: { data: unknown }) => replies.push(event) },
    MessageEvent: class { constructor(public type: string, public options: { data: unknown }) {} get data() { return this.options.data } } }
  runInNewContext(host.invoke.mock.calls.at(-1)![0].params.func, browser)
  expect(replies.at(-1)!.data).toMatchObject({ type: 'songloft-host-reply', id: 'native-1', ok: true })
  await act(async () => {
    send({ type: 'songloft-host-call', id: 'native-2', ns: 'missing', method: 'get' })
    await Promise.resolve()
  })
  runInNewContext(host.invoke.mock.calls.at(-1)![0].params.func, browser)
  expect(replies.at(-1)!.data).toMatchObject({ id: 'native-2', ok: false, error: 'unknown namespace: missing' })
  await act(async () => {
    send({ type: 'songloft-host-call', id: 'native-before-load', ns: 'host', method: 'getInfo' })
    const event = frame.ownerDocument.createEvent('Event')
    event.initEvent('bindEvent:load', false, false)
    Object.assign(event, { eventType: 'bindEvent', eventName: 'load', detail: {} })
    frame.dispatchEvent(event)
    await Promise.resolve()
  })
  runInNewContext(host.invoke.mock.calls.at(-1)![0].params.func, browser)
  expect(replies.at(-1)!.data).toMatchObject({ id: 'native-before-load', ok: true })
  host.invoke.mockImplementationOnce(() => { throw new Error('native view destroyed') })
  await act(async () => {
    send({ type: 'songloft-host-call', id: 'native-destroyed', ns: 'host', method: 'getInfo' })
    await Promise.resolve()
  })
  expect(host.invoke).toHaveBeenLastCalledWith(expect.objectContaining({
    params: { func: expect.stringContaining('native-destroyed') },
  }))
  host.invoke.mockClear()
  await act(async () => {
    send({ type: 'songloft-host-call', id: 'native-late', ns: 'host', method: 'getInfo' })
    unmount()
    await Promise.resolve()
  })
  expect(host.invoke).not.toHaveBeenCalled()
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

/*
 * The point of the whole batch: this host's nav is a fixed capsule, and the
 * plugin can only learn that from the pushed `appearance` — there is no URL
 * fallback channel for it. Without `navigationStyle: 'capsule'` a capsule-aware
 * plugin (miot) renders its standard edge-to-edge bar.
 */
test('the pushed theme message carries this host’s capsule appearance', async () => {
  await renderPage()
  const themeMsg = h.postMessage.mock.calls
    .map((c) => JSON.parse(c[0] as string))
    .find((m) => m.type === 'songloft-theme')
  expect(themeMsg.appearance).toMatchObject({
    navigationStyle: 'capsule',
    glassFill: expect.stringMatching(/^rgba\(/),
    glassBorder: expect.stringMatching(/^rgba\(/),
  })
})

test('material/accessibility changes send one complete payload and detach on unmount', async () => {
  const result = await renderPage()
  const latest = () => JSON.parse(h.postMessage.mock.calls.at(-1)![0] as string)
  expect(h.materialSubs.size).toBe(1)
  expect(h.policySubs.size).toBe(1)
  let before = h.postMessage.mock.calls.length
  act(() => {
    h.variant = 'ultra-thin'
    h.materialSubs.forEach(fn => fn())
  })
  expect(h.postMessage.mock.calls.length).toBe(before + 1)
  expect(latest().appearance.glassFill).toBe('rgba(255, 255, 255, 0.55)')
  before = h.postMessage.mock.calls.length
  act(() => {
    h.policy = { reduceTransparency: true, increaseContrast: true, opaque: true }
    h.policySubs.forEach(fn => fn())
  })
  expect(h.postMessage.mock.calls.length).toBe(before + 1)
  expect(latest().appearance).toMatchObject({ reduceTransparency: true, increaseContrast: true, glassFill: 'rgba(255, 255, 255, 1)' })
  expect(latest().colors.primary).toBe('#1e6ef4')
  act(() => { result.unmount() })
  expect(h.policySubs.size).toBe(0)
  expect(h.materialSubs.size).toBe(0)
})

/*
 * A pack activation swaps radii without flipping light/dark — the theme
 * subscription stays silent, so the pack needs its own re-push. The payload
 * must reflect the NEW pack, not the one captured at mount.
 */
test('a theme-pack change re-pushes the appearance with the pack’s radii', async () => {
  await renderPage()
  h.activePack = {
    themeId: 'p1',
    data: { id: 'p1', name: 'P', author: 'a', description: 'd', version: '1', schemaVersion: 1, cardRadius: 30 },
  }
  act(() => {
    for (const fn of h.packSubs) fn()
    // Also fires via the shared subscription on the page level — harmless.
    for (const fn of h.themeSubs) fn()
  })
  const themeMsgs = h.postMessage.mock.calls
    .map((c) => JSON.parse(c[0] as string))
    .filter((m) => m.type === 'songloft-theme')
  expect(themeMsgs.length).toBeGreaterThan(1)
  expect(themeMsgs.at(-1)!.appearance.cardRadius).toBe(30)
})

/*
 * A freshly opened document drops postMessage aimed at it while still loading
 * — the load event is the moment the theme/appearance payload can land on a
 * first paint (Flutter's onLoadStop does the same re-push). Player-state rides
 * the same drop rule and re-sends too.
 */
test('an iframe load event re-sends the theme message and player state', async () => {
  await renderPage()
  const before = h.postMessage.mock.calls.length
  act(() => {
    activeHandlers().onLoad?.()
  })
  // One back connection + one theme + one player-state message.
  expect(h.postMessage.mock.calls.length).toBe(before + 3)
  const themeMsg = JSON.parse(h.postMessage.mock.calls.at(-2)![0] as string)
  expect(themeMsg.type).toBe('songloft-theme')
  expect(themeMsg.appearance.navigationStyle).toBe('capsule')
  const playerMsg = JSON.parse(h.postMessage.mock.calls.at(-1)![0] as string)
  expect(playerMsg.type).toBe('songloft-player-state')
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

test('iframe state owns back until the plugin root; overlays remain above it', async () => {
  const { unmount } = await renderPage()
  const connection = h.postMessage.mock.calls.map(call => JSON.parse(call[0] as string))
    .find(message => message.type === 'songloft-back-connect')!
  act(() => activeHandlers().onMessage({ type: 'songloft-back-state', session: connection.session, canBack: true }))
  let removeOverlay = () => { }
  removeOverlay = pushBackHandler(() => { removeOverlay(); return true })
  const before = h.postMessage.mock.calls.length
  act(() => { expect(dispatchBack()).toBe(true) })
  expect(h.postMessage).toHaveBeenCalledTimes(before)
  act(() => { expect(dispatchBack()).toBe(true) })
  const request = JSON.parse(h.postMessage.mock.calls.at(-1)![0] as string)
  expect(request).toMatchObject({ type: 'songloft-back-request', session: connection.session })
  act(() => activeHandlers().onMessage({ type: 'songloft-back-result', session: connection.session, id: request.id, consumed: true, canBack: false }))
  expect(h.continueBack).not.toHaveBeenCalled()
  expect(dispatchBack()).toBe(false)
  unmount()
})

test('iframe declines or times out once; unmount cancels a pending fallback', async () => {
  vi.useFakeTimers()
  try {
    const { unmount } = await renderPage()
    const connection = h.postMessage.mock.calls.map(call => JSON.parse(call[0] as string))
      .find(message => message.type === 'songloft-back-connect')!
    const activate = () => activeHandlers().onMessage({ type: 'songloft-back-state', session: connection.session, canBack: true })
    act(activate)
    act(() => { dispatchBack(); dispatchBack() })
    const request = JSON.parse(h.postMessage.mock.calls.at(-1)![0] as string)
    act(() => activeHandlers().onMessage({ type: 'songloft-back-result', session: connection.session, id: request.id, consumed: false, canBack: false }))
    expect(h.continueBack).toHaveBeenCalledTimes(1)
    act(activate)
    act(() => { dispatchBack(); vi.advanceTimersByTime(1000) })
    expect(h.continueBack).toHaveBeenCalledTimes(2)
    act(activate)
    act(() => { dispatchBack(); unmount(); vi.advanceTimersByTime(1000) })
    expect(h.continueBack).toHaveBeenCalledTimes(2)
  } finally { vi.useRealTimers() }
})

test('native WebView connects and requests back through DOM events, without eval result assumptions', async () => {
  h.isWeb = false
  const host = nativeHost()
  const { q, unmount } = await renderPage()
  const emitted: Array<{ type: string; detail: Record<string, unknown> }> = []
  const browser = {
    document: { dispatchEvent: (event: { type: string; detail: Record<string, unknown> }) => emitted.push(event) },
    CustomEvent: class { constructor(public type: string, public options: { detail: Record<string, unknown> }) { } get detail() { return this.options.detail } },
  }
  runInNewContext(host.invoke.mock.calls[0]![0].params.func, browser)
  const session = emitted[0]!.detail['session']
  const receive = (payload: unknown) => {
    const target = q.getByTestId('plugin-webview-frame')
    const event = target.ownerDocument.createEvent('Event')
    event.initEvent('bindEvent:message', false, false)
    Object.assign(event, { eventType: 'bindEvent', eventName: 'message', detail: { msg: JSON.stringify(payload) } })
    fireEvent(target, event)
  }
  act(() => { receive({ type: 'songloft-back-state', session, canBack: true }) })
  act(() => { expect(dispatchBack()).toBe(true) })
  runInNewContext(host.invoke.mock.calls.at(-1)![0].params.func, browser)
  expect(emitted.at(-1)!.type).toBe('songloft-back-request')
  const id = emitted.at(-1)!.detail['id']
  act(() => { receive({ type: 'songloft-back-result', session, id, consumed: true, canBack: false }) })
  expect(h.continueBack).not.toHaveBeenCalled()
  expect(dispatchBack()).toBe(false)
  unmount()
})

test('a pending plugin timeout respects an overlay opened while awaiting the reply', async () => {
  vi.useFakeTimers()
  try {
    const { unmount } = await renderPage()
    const connection = h.postMessage.mock.calls.map(call => JSON.parse(call[0] as string))
      .find(message => message.type === 'songloft-back-connect')!
    act(() => activeHandlers().onMessage({ type: 'songloft-back-state', session: connection.session, canBack: true }))
    act(() => { expect(dispatchBack()).toBe(true) })
    const closeOverlay = vi.fn()
    let removeOverlay = () => { }
    removeOverlay = pushBackHandler(() => { closeOverlay(); removeOverlay(); return true })
    act(() => { vi.advanceTimersByTime(1000) })
    expect(closeOverlay).toHaveBeenCalledTimes(1)
    expect(h.continueBack).not.toHaveBeenCalled()
    expect(dispatchBack()).toBe(false)
    unmount()
  } finally { vi.useRealTimers() }
})
