/**
 * The plugin-frame keep-alive state machine, executed rather than read.
 *
 * `web/webview-host.js` and `web/lynx-frame-host.js` used to destroy a plugin
 * frame whenever its page unmounted, i.e. on every tab switch — and detaching a
 * plugin frame is what crashed Chrome's renderer (error code 11 / SIGSEGV,
 * reproduced 15/15 with an all-frames extension + DevTools open; drop any one of
 * the three conditions and it never fires). Root cause, bisect and the
 * browser-level regression harness: `docs/archive/web-plugin-tab-crash.md` and
 * `scripts/cdp-plugin-tab-crash.mjs`.
 *
 * The browser harness proves the fix on real Chrome but cannot run in CI (it needs
 * a specific extension plus a DevTools frontend). These tests are the CI half:
 * they run the real host scripts and pin the invariants that keep the crash away.
 *
 * ── Why a hand-rolled DOM ────────────────────────────────────────────────────
 *
 * This repo declares no DOM implementation — `jsdom` exists only as somebody
 * else's transitive dependency, so switching this file's vitest environment to it
 * would break on the next lockfile change. The host scripts touch a small,
 * enumerable surface, so the stub below IS that surface, and it makes the
 * assertions sharper: `appendChild` / `removeChild` are counted, so "never
 * detaches" is checked directly instead of inferred from a source-text grep.
 *
 * (Do not name the environment pragma in prose here. Vitest scans this comment for
 * it, and a mention alone switched the file to a DOM environment where ReactLynx's
 * setup dies on a missing `lynx` global — which is what happened while writing
 * this file.)
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'

import { beforeEach, describe, expect, test } from 'vitest'

const repoRoot = path.resolve(__dirname, '..', '..')
const readHost = (name: string): string =>
  readFileSync(path.join(repoRoot, 'web', name), 'utf8')

interface FakeEl {
  tagName: string
  style: Record<string, string>
  attrs: Record<string, string>
  children: FakeEl[]
  parentNode: FakeEl | null
  shadowRoot: FakeEl | null
  innerHTML: string
  src?: string
  contentWindow: { postMessage: (msg: unknown, origin: string) => void; posted: unknown[] }
  globalProps?: Record<string, unknown>
  nativeModulesMap?: Record<string, string>
  onNativeModulesCall?: (name: string, data: unknown[], moduleName: string) => unknown
  listeners: Record<string, Array<(e: unknown) => void>>
  rect: { left: number; top: number; width: number; height: number }
  appendChild(c: FakeEl): FakeEl
  removeChild(c: FakeEl): FakeEl
  remove(): void
  setAttribute(n: string, v: string): void
  getAttribute(n: string): string | null
  addEventListener(t: string, fn: (e: unknown) => void): void
  getBoundingClientRect(): { left: number; top: number; width: number; height: number }
  querySelector(sel: string): FakeEl | null
  querySelectorAll(sel: string): FakeEl[]
  sendGlobalEvent?: (name: string, args: unknown[]) => void
}

interface Harness {
  lynxView: FakeEl
  shadowRoot: FakeEl
  /** Every `appendChild` / `removeChild` the script performed, in order. */
  mutations: Array<{ op: 'append' | 'remove'; tag: string }>
  createdTags: string[]
  events: Array<{ name: string; data: unknown }>
  /** Invoke a native-module handler the way web-core's worker bridge does. */
  call(moduleName: string, method: string, args?: unknown[]): unknown
  messageListeners: Array<(e: unknown) => void>
  window: Record<string, unknown>
  visibility(state: 'visible' | 'hidden'): void
}

function makeEl(tagName: string, h: { mutations: Harness['mutations'] }): FakeEl {
  const el: FakeEl = {
    tagName: tagName.toUpperCase(),
    style: {},
    attrs: {},
    children: [],
    parentNode: null,
    shadowRoot: null,
    innerHTML: '',
    contentWindow: {
      posted: [],
      postMessage(msg) { el.contentWindow.posted.push(msg) },
    },
    listeners: {},
    rect: { left: 0, top: 0, width: 0, height: 0 },
    appendChild(c) {
      el.children.push(c)
      c.parentNode = el
      h.mutations.push({ op: 'append', tag: c.tagName })
      return c
    },
    removeChild(c) {
      el.children = el.children.filter((x) => x !== c)
      c.parentNode = null
      h.mutations.push({ op: 'remove', tag: c.tagName })
      return c
    },
    remove() { if (el.parentNode) el.parentNode.removeChild(el) },
    setAttribute(n, v) { el.attrs[n] = v },
    getAttribute(n) { return n in el.attrs ? el.attrs[n]! : null },
    addEventListener(t, fn) { (el.listeners[t] ??= []).push(fn) },
    getBoundingClientRect() { return el.rect },
    querySelector(sel) {
      return el.children.find((c) => c.attrs['id'] === sel.replace(/^#/, '')) ?? null
    },
    querySelectorAll(sel) {
      const want = sel.toUpperCase()
      return el.children.filter((c) => c.tagName === want)
    },
  }
  return el
}

/**
 * Run a host script against the stub DOM and return the handles a test needs.
 *
 * The script is an IIFE reading `document` / `window` / `ResizeObserver` off the
 * global scope, so they are injected as parameters — no globals are touched and
 * each test gets a clean world.
 */
function runHost(scriptName: string, placeholderId: string): Harness {
  const mutations: Harness['mutations'] = []
  const createdTags: string[] = []
  const events: Harness['events'] = []
  const messageListeners: Array<(e: unknown) => void> = []

  const holder = { mutations }
  const lynxView = makeEl('lynx-view', holder)
  lynxView.attrs['id'] = 'app'
  lynxView.rect = { left: 0, top: 0, width: 1200, height: 900 }
  const shadowRoot = makeEl('#shadow-root', holder)
  lynxView.shadowRoot = shadowRoot
  lynxView.sendGlobalEvent = (name, args) => { events.push({ name, data: args?.[0] }) }

  // The placeholder the app renders and the host mirrors its frame onto. Non-zero
  // box: `placeFromElement` refuses to place (and therefore to show) an empty one.
  const placeholder = makeEl('view', holder)
  placeholder.attrs['id'] = placeholderId
  placeholder.rect = { left: 0, top: 60, width: 1200, height: 700 }
  shadowRoot.children.push(placeholder)

  const visibilityListeners: Array<() => void> = []
  const document = {
    baseURI: 'https://music.example/songloft/',
    visibilityState: 'visible',
    addEventListener: (name: string, fn: () => void) => { if (name === 'visibilitychange') visibilityListeners.push(fn) },
    getElementById: (id: string) => (id === 'app' ? lynxView : null),
    createElement: (tag: string) => { createdTags.push(tag); return makeEl(tag, holder) },
    body: makeEl('body', holder),
    querySelectorAll: () => [] as FakeEl[],
  }
  const window: Record<string, unknown> = {
    addEventListener: (t: string, fn: (e: unknown) => void) => {
      if (t === 'message') messageListeners.push(fn)
    },
  }
  class ResizeObserver {
    observe(): void {}
    disconnect(): void {}
  }

  // eslint-disable-next-line no-new-func
  new Function('window', 'document', 'ResizeObserver', readHost(scriptName))(
    window, document, ResizeObserver,
  )

  return {
    lynxView,
    shadowRoot,
    mutations,
    createdTags,
    events,
    messageListeners,
    window,
    visibility(state) { document.visibilityState = state; visibilityListeners.forEach(fn => fn()) },
    call: (moduleName, method, args = []) =>
      lynxView.onNativeModulesCall!(method, args, moduleName),
  }
}

const frames = (h: Harness): FakeEl[] => h.shadowRoot.children.filter((c) => c.tagName === 'IFRAME')
const lynxChildren = (h: Harness): FakeEl[] =>
  h.shadowRoot.children.filter((c) => c.tagName === 'LYNX-VIEW')
const detachCount = (h: Harness): number => h.mutations.filter((m) => m.op === 'remove').length

const URL_A = 'http://server/api/v1/jsplugin/alpha/?embed&theme=dark'
const URL_B = 'http://server/api/v1/jsplugin/beta/?embed&theme=dark'

describe('webview-host.js keeps plugin iframes alive', () => {
  let h: Harness
  beforeEach(() => { h = runHost('webview-host.js', 'plugin-webview-frame') })

  const open = (url: string, key: string) =>
    h.call('SongloftWebview', 'open', [url, '#plugin-webview-frame', key])

  test('open creates one frame, placed and visible', () => {
    open(URL_A, 'alpha')
    expect(frames(h)).toHaveLength(1)
    const f = frames(h)[0]!
    expect(f.src).toBe(URL_A)
    // Visibility is the "placement landed" marker — a frame must never be shown
    // before its rect is known good.
    expect(f.style['visibility']).toBe('visible')
    expect(f.style['top']).toBe('60px')
    expect(f.style['height']).toBe('700px')
  })

  /** The crash invariant. Everything else here is a means to this end. */
  test('leaving the page hides the frame and NEVER detaches it', () => {
    open(URL_A, 'alpha')
    h.call('SongloftWebview', 'hide', ['alpha'])
    expect(frames(h), 'the frame must stay in the DOM').toHaveLength(1)
    expect(frames(h)[0]!.style['visibility']).toBe('hidden')
    expect(detachCount(h), 'no frame may ever be detached').toBe(0)
  })

  test('re-entering reuses the same frame without reloading it', () => {
    open(URL_A, 'alpha')
    const first = frames(h)[0]!
    h.call('SongloftWebview', 'hide', ['alpha'])
    open(URL_A, 'alpha')
    expect(frames(h)).toHaveLength(1)
    expect(frames(h)[0], 'a new element means the plugin reloaded').toBe(first)
    // One createElement for the whole trip: that is what preserves plugin state.
    expect(h.createdTags.filter((t) => t === 'iframe')).toHaveLength(1)
    expect(first.style['visibility']).toBe('visible')
  })

  test('switching plugins hides the old frame and keeps both attached', () => {
    open(URL_A, 'alpha')
    open(URL_B, 'beta')
    expect(frames(h)).toHaveLength(2)
    const [a, b] = frames(h) as [FakeEl, FakeEl]
    expect(a.style['visibility']).toBe('hidden')
    expect(b.style['visibility']).toBe('visible')
    expect(detachCount(h)).toBe(0)
  })

  /*
   * Keyed by plugin, never by URL: the plugin URL carries `?theme=` and
   * `?access_token=`, so a URL key would strand a frame per theme flip and per
   * re-login — an unbounded leak of live plugin documents.
   */
  test('a changed URL for the same key navigates the frame instead of adding one', () => {
    open(URL_A, 'alpha')
    const first = frames(h)[0]!
    open(`${URL_A}&access_token=new`, 'alpha')
    expect(frames(h)).toHaveLength(1)
    expect(frames(h)[0]).toBe(first)
    expect(first.src).toBe(`${URL_A}&access_token=new`)
  })

  test('close releases the document but leaves the element attached', () => {
    open(URL_A, 'alpha')
    h.call('SongloftWebview', 'close', ['alpha'])
    expect(frames(h), 'close must not detach — that is the crash').toHaveLength(1)
    expect(frames(h)[0]!.src).toBe('about:blank')
    expect(frames(h)[0]!.style['visibility']).toBe('hidden')
    expect(detachCount(h)).toBe(0)
  })

  test('close with no key releases every plugin (the logout path)', () => {
    open(URL_A, 'alpha')
    open(URL_B, 'beta')
    h.call('SongloftWebview', 'close', [''])
    expect(frames(h)).toHaveLength(2)
    for (const f of frames(h)) expect(f.src).toBe('about:blank')
  })

  test('a released frame is reused on the next open', () => {
    open(URL_A, 'alpha')
    const first = frames(h)[0]!
    h.call('SongloftWebview', 'close', ['alpha'])
    open(URL_A, 'alpha')
    expect(frames(h)[0]).toBe(first)
    expect(first.src).toBe(URL_A)
    expect(h.createdTags.filter((t) => t === 'iframe')).toHaveLength(1)
  })

  test('postMessage reaches the active frame only', () => {
    open(URL_A, 'alpha')
    open(URL_B, 'beta')
    h.call('SongloftWebview', 'postMessage', ['{"type":"songloft-theme"}'])
    const [a, b] = frames(h) as [FakeEl, FakeEl]
    expect(a.contentWindow.posted).toHaveLength(0)
    expect(b.contentWindow.posted).toEqual([{ type: 'songloft-theme' }])
  })

  /*
   * A hidden plugin keeps running and can post at any time. Forwarding that would
   * hand plugin A's host call to whichever plugin page is mounted — and reply into
   * that one.
   */
  test('messages from a kept-alive but inactive frame are ignored', () => {
    open(URL_A, 'alpha')
    open(URL_B, 'beta')
    const [a, b] = frames(h) as [FakeEl, FakeEl]
    const deliver = (source: FakeEl['contentWindow']) => {
      for (const fn of h.messageListeners) fn({ source, data: { type: 'songloft-host-call' } })
    }
    deliver(a.contentWindow)
    expect(h.events.filter((e) => e.name === 'SongloftWebview.message')).toHaveLength(0)
    deliver(b.contentWindow)
    expect(h.events.filter((e) => e.name === 'SongloftWebview.message')).toHaveLength(1)
  })
})

describe('lynx-frame-host.js keeps nested <lynx-view> children alive', () => {
  let h: Harness
  beforeEach(() => { h = runHost('lynx-frame-host.js', 'plugin-lynx-frame') })

  const BUNDLE_A = 'http://server/api/v1/jsplugin/alpha/static/main.web.bundle'
  const BUNDLE_B = 'http://server/api/v1/jsplugin/beta/static/main.web.bundle'
  const open = (bundle: string, key: string) =>
    h.call('SongloftLynxFrame', 'open', [bundle, '#plugin-lynx-frame', '{"theme":"dark"}', key])

  test('open creates and places one child', async () => {
    await open(BUNDLE_A, 'alpha')
    expect(lynxChildren(h)).toHaveLength(1)
    const c = lynxChildren(h)[0]!
    expect(c.getAttribute('url')).toBe(BUNDLE_A)
    expect(c.style['display']).toBe('block')
  })

  test('leaving the page hides the child and NEVER detaches it', async () => {
    await open(BUNDLE_A, 'alpha')
    h.call('SongloftLynxFrame', 'hide', ['alpha'])
    expect(lynxChildren(h)).toHaveLength(1)
    expect(lynxChildren(h)[0]!.style['display']).toBe('none')
    expect(detachCount(h)).toBe(0)
  })

  test('re-entering reuses the child — no second worker', async () => {
    await open(BUNDLE_A, 'alpha')
    const first = lynxChildren(h)[0]!
    h.call('SongloftLynxFrame', 'hide', ['alpha'])
    await open(BUNDLE_A, 'alpha')
    expect(lynxChildren(h)).toHaveLength(1)
    expect(lynxChildren(h)[0]).toBe(first)
    expect(h.createdTags.filter((t) => t === 'lynx-view')).toHaveLength(1)
    expect(first.style['display']).toBe('block')
  })

  test('switching plugins hides the old child and keeps both attached', async () => {
    await open(BUNDLE_A, 'alpha')
    await open(BUNDLE_B, 'beta')
    expect(lynxChildren(h)).toHaveLength(2)
    const [a, b] = lynxChildren(h) as [FakeEl, FakeEl]
    expect(a.style['display']).toBe('none')
    expect(b.style['display']).toBe('block')
    expect(detachCount(h)).toBe(0)
  })

  /*
   * Detaching IS the only way to release a <lynx-view> — web-core's `#render()`
   * bails out when `url` is falsy, so clearing the url does not dispose. So
   * `close` detaches, which is exactly why the recreate has to wait (next test).
   */
  test('close detaches the child, unlike the iframe path', async () => {
    await open(BUNDLE_A, 'alpha')
    const child = lynxChildren(h)[0]!
    child.shadowRoot = makeEl('#child-shadow', { mutations: h.mutations })
    child.shadowRoot.innerHTML = ''
    h.call('SongloftLynxFrame', 'close', ['alpha'])
    expect(lynxChildren(h)).toHaveLength(0)
    expect(child.parentNode).toBeNull()
  })

  /**
   * The second bug the old code had: `disconnectedCallback` → `#disposeInstance()`
   * is async (it awaits the instance's `Symbol.asyncDispose` before tearing down
   * the worker and the iframe realm), and `removeChild` + an immediate
   * `createElement('lynx-view')` stacked a new worker on one still going down.
   * Dispose is observably finished when web-core empties the element's shadow root.
   */
  test('re-opening a closed key waits for web-core to finish disposing', async () => {
    await open(BUNDLE_A, 'alpha')
    const child = lynxChildren(h)[0]!
    // A rendered <lynx-view> whose dispose has not completed yet.
    child.shadowRoot = makeEl('#child-shadow', { mutations: h.mutations })
    child.shadowRoot.innerHTML = '<div part="page"></div>'
    h.call('SongloftLynxFrame', 'close', ['alpha'])

    const pending = open(BUNDLE_A, 'alpha')
    await new Promise((r) => setTimeout(r, 40))
    expect(
      lynxChildren(h),
      'a new child before the old one finished disposing is the race',
    ).toHaveLength(0)

    // web-core finishes: shadow root emptied.
    child.shadowRoot.innerHTML = ''
    await pending
    expect(lynxChildren(h)).toHaveLength(1)
    expect(h.createdTags.filter((t) => t === 'lynx-view')).toHaveLength(2)
  })

  /*
   * The wait introduced by `awaitDisposed` opens a window where the user can act.
   * Whatever they do last has to win, or a plugin they already left comes back —
   * on top of the one they went to.
   */
  test('an open superseded while waiting for dispose does not create a child', async () => {
    await open(BUNDLE_A, 'alpha')
    const child = lynxChildren(h)[0]!
    child.shadowRoot = makeEl('#child-shadow', { mutations: h.mutations })
    child.shadowRoot.innerHTML = '<div part="page"></div>'
    h.call('SongloftLynxFrame', 'close', ['alpha'])

    const pending = open(BUNDLE_A, 'alpha')
    // The user leaves the plugin page before the old instance finished disposing.
    h.call('SongloftLynxFrame', 'hide', ['alpha'])
    child.shadowRoot.innerHTML = ''
    await pending

    expect(lynxChildren(h), 'a superseded open must not create a child').toHaveLength(0)
    expect(h.createdTags.filter((t) => t === 'lynx-view')).toHaveLength(1)
  })

  test('a pending open loses to a later open for another plugin', async () => {
    await open(BUNDLE_A, 'alpha')
    const child = lynxChildren(h)[0]!
    child.shadowRoot = makeEl('#child-shadow', { mutations: h.mutations })
    child.shadowRoot.innerHTML = '<div part="page"></div>'
    h.call('SongloftLynxFrame', 'close', ['alpha'])

    const pendingA = open(BUNDLE_A, 'alpha')
    await open(BUNDLE_B, 'beta')
    child.shadowRoot.innerHTML = ''
    await pendingA

    const children = lynxChildren(h)
    expect(children, 'only the plugin the user actually opened may exist').toHaveLength(1)
    expect(children[0]!.getAttribute('url')).toBe(BUNDLE_B)
    expect(children[0]!.style['display']).toBe('block')
  })

  test('host calls from a kept-alive but inactive child are ignored', async () => {
    await open(BUNDLE_A, 'alpha')
    const a = lynxChildren(h)[0]!
    await open(BUNDLE_B, 'beta')
    const b = lynxChildren(h)[1]!
    const hostCall = (c: FakeEl) =>
      c.onNativeModulesCall!('hostCall', ['fid', 'cid', 'ns', 'm', '{}'], 'SongloftPluginBridge')

    hostCall(a)
    expect(h.events.filter((e) => e.name === 'SongloftLynxFrame.message')).toHaveLength(0)
    hostCall(b)
    expect(h.events.filter((e) => e.name === 'SongloftLynxFrame.message')).toHaveLength(1)
  })

  test('sendEvent and hostReply target the active child only', async () => {
    await open(BUNDLE_A, 'alpha')
    const a = lynxChildren(h)[0]!
    const seenA: string[] = []
    a.sendGlobalEvent = (name) => { seenA.push(name) }
    await open(BUNDLE_B, 'beta')
    const b = lynxChildren(h)[1]!
    const seenB: string[] = []
    b.sendGlobalEvent = (name) => { seenB.push(name) }

    h.call('SongloftLynxFrame', 'sendEvent', ['SongloftPluginBridge.push', '{"event":"playerState"}'])
    h.call('SongloftLynxFrame', 'hostReply', ['cid', '{"ok":true}'])
    expect(seenA).toEqual([])
    expect(seenB).toEqual(['SongloftPluginBridge.push', 'SongloftPluginBridge.hostReply'])
  })

  test('ready, foreground and re-entry resume only the active child without reloading it', async () => {
    await open(BUNDLE_A, 'alpha')
    const a = lynxChildren(h)[0]!, seenA: unknown[] = []
    a.sendGlobalEvent = (name, args) => seenA.push([name, args])
    const ready = (child: FakeEl) => child.onNativeModulesCall!('hostCall', ['fid', 'lifecycle-ready', 'lifecycle', 'ready', '{}'], 'SongloftPluginBridge')
    ready(a); ready(a)
    expect(seenA).toEqual([['SongloftPluginBridge.push', [{ event: 'lifecycle', data: '{"state":"resumed"}' }]]])
    h.visibility('hidden'); h.visibility('visible'); h.visibility('visible')
    expect(seenA).toHaveLength(2)
    await open(BUNDLE_B, 'beta')
    const b = lynxChildren(h)[1]!, seenB: unknown[] = []
    b.sendGlobalEvent = (name, args) => seenB.push([name, args])
    ready(b); h.visibility('hidden'); h.visibility('visible')
    expect(seenA).toHaveLength(2); expect(seenB).toHaveLength(2)
    await open(BUNDLE_A, 'alpha')
    expect(lynxChildren(h)[0]).toBe(a); expect(seenA).toHaveLength(3)
    h.call('SongloftLynxFrame', 'hide', ['alpha'])
    h.visibility('hidden'); h.visibility('visible'); expect(seenA).toHaveLength(3)
    expect(h.events.filter(e => e.name === 'SongloftLynxFrame.message')).toHaveLength(0)
    expect(detachCount(h)).toBe(0)
  })

  test('readiness while hidden survives re-entry; a released worker cannot mark the replacement ready', async () => {
    await open(BUNDLE_A, 'alpha')
    const old = lynxChildren(h)[0]!, seen: unknown[] = []
    old.sendGlobalEvent = (name, args) => seen.push([name, args])
    const ready = (child: FakeEl) => child.onNativeModulesCall!('hostCall', ['fid', 'lifecycle-ready', 'lifecycle', 'ready', '{}'], 'SongloftPluginBridge')
    h.call('SongloftLynxFrame', 'hide', ['alpha']); ready(old)
    expect(seen).toHaveLength(0)
    await open(BUNDLE_A, 'alpha'); expect(seen).toHaveLength(1)
    h.call('SongloftLynxFrame', 'close', ['alpha'])
    await open(BUNDLE_A, 'alpha')
    const replacement = lynxChildren(h)[0]!, replacementEvents: unknown[] = []
    replacement.sendGlobalEvent = (name, args) => replacementEvents.push([name, args])
    ready(old); h.visibility('hidden'); h.visibility('visible')
    expect(replacementEvents).toHaveLength(0)
    ready(replacement); expect(replacementEvents).toHaveLength(1)
  })
})
