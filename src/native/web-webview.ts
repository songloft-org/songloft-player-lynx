/**
 * In-app plugin webview for the Web platform — `NativeModules.SongloftWebview`.
 *
 * `<webview>` has no Web implementation (absent from web-core's tag map), and the
 * worker realm has no `document` to build one with, so the plugin page is an
 * iframe the main thread owns (`web/webview-host.js`). This facade is the
 * worker-side half: it probes the module the worker-side ESM factory
 * (`web/songloft-webview-module.js`) produces and exposes the same
 * fire-and-forget surface as `navigation.ts`.
 *
 * Everything flows one way through the module (open / postMessage / hide /
 * close); the iframe's own traffic comes back as global events, subscribed via
 * {@link setWebviewBridgeHandlers}.
 *
 * Leaving a plugin page calls {@link WebviewModule.hide}, never `close`: the
 * main thread must not detach the frame, because detaching a plugin frame is
 * what crashed the renderer (error code 11). `close` is reserved for the plugin
 * actually going away. See docs/archive/web-plugin-tab-crash.md.
 */
import { readLynxGlobal, readNativeModules } from './native-modules.js'

/**
 * A plugin host call forwarded from the iframe. Only the decoded payload —
 * `sendGlobalEvent(name, [payload])` delivers the array's first element as the
 * listener's first argument.
 */
export const WEBVIEW_MESSAGE_EVENT = 'SongloftWebview.message'

/**
 * The main thread could not find the placeholder the open call named (after a
 * short poll covering the element-flush race). The page falls back to its
 * "unavailable" message.
 */
export const WEBVIEW_OPEN_FAILED_EVENT = 'SongloftWebview.openFailed'

/** The native shape: writes with positional args, no callbacks. */
export interface SongloftWebviewNativeModule {
  /**
   * `key` identifies the plugin surface (its `entryPath`) and is what the main
   * thread keeps frames alive by. Deliberately NOT the URL: the URL carries
   * `?theme=` and `?access_token=`, so keying on it would strand one frame per
   * theme flip and per re-login.
   */
  open(url: string, selector: string, key: string): void
  postMessage(json: string): void
  /** Leave the page, keep the plugin alive off screen (the tab-switch path). */
  hide(key: string): void
  /** Release the plugin's document. Empty `key` releases all (logout). */
  close(key: string): void
}

const NATIVE_METHODS = ['open', 'postMessage', 'hide', 'close'] as const

function readNative(): SongloftWebviewNativeModule | null {
  const mod = readNativeModules()?.SongloftWebview as Record<string, unknown> | undefined
  if (!mod) return null
  // A partial module is worse than none: `mod?.method?.()` would turn the
  // missing half into a silent no-op — for `hide` that leaves the plugin frame
  // painted over the app every time the page is left, and for `close` it keeps a
  // removed plugin running. Same rule as `navigation.ts`.
  for (const name of NATIVE_METHODS) {
    if (typeof mod[name] !== 'function') return null
  }
  return mod as unknown as SongloftWebviewNativeModule
}

export interface WebviewModule extends SongloftWebviewNativeModule {
  /** False outside the Web host (native platforms, tests, stale host pages). */
  readonly available: boolean
}

function createNativeAdapter(native: SongloftWebviewNativeModule): WebviewModule {
  return {
    available: true,
    open(url, selector, key) {
      try {
        native.open(url, selector, key)
      } catch {
        // The page keeps its placeholder; the caller surfaces unavailability.
      }
    },
    postMessage(json) {
      try {
        native.postMessage(json)
      } catch {
        // One lost frame of state is harmless; the next change re-sends.
      }
    },
    hide(key) {
      try {
        native.hide(key)
      } catch {
        // Worst case the frame stays on screen until the next placement.
      }
    },
    close(key) {
      try {
        native.close(key)
      } catch {
        // Worst case the plugin document lives until reload.
      }
    },
  }
}

/** Inert stand-in so callers need no platform checks. */
function createUnavailableStub(): WebviewModule {
  return {
    available: false,
    open() {},
    postMessage() {},
    hide() {},
    close() {},
  }
}

let cached: WebviewModule | null = null

/**
 * Only the *real* adapter is memoised — the stub is not, for the same reason as
 * `getNavigationModule`: `NativeModules` may not be populated at first probe.
 */
export function getWebviewModule(): WebviewModule {
  if (cached) return cached
  const native = readNative()
  if (!native) return createUnavailableStub()
  cached = createNativeAdapter(native)
  return cached
}

export interface WebviewBridgeHandlers {
  /** A message arrived from the plugin iframe (`songloft-host-call`, …). */
  onMessage: (payload: unknown) => void
  /** The main thread could not place the iframe (placeholder never appeared). */
  onOpenFailed: () => void
}

/**
 * Handlers for the iframe's own traffic. Passing `null` detaches (the previous
 * page's subscriptions end); the global-event listeners stay installed and
 * simply forward to nobody, which is cheaper than churning listeners per page.
 *
 * The listeners are installed at most once — same pattern as
 * `installBackPressedListener` — because the events are page-independent; only
 * the handlers change.
 */
let bridgeHandlers: WebviewBridgeHandlers | null = null
let listenersInstalled = false

export function setWebviewBridgeHandlers(handlers: WebviewBridgeHandlers | null): void {
  bridgeHandlers = handlers
  if (listenersInstalled || handlers == null) return
  const l = readLynxGlobal()
  if (!l || typeof l.getJSModule !== 'function') return
  try {
    const emitter = l.getJSModule('GlobalEventEmitter')
    if (!emitter || typeof emitter.addListener !== 'function') return
    emitter.addListener(WEBVIEW_MESSAGE_EVENT, (payload: unknown) => {
      bridgeHandlers?.onMessage(payload)
    })
    emitter.addListener(WEBVIEW_OPEN_FAILED_EVENT, () => {
      bridgeHandlers?.onOpenFailed()
    })
    listenersInstalled = true
  } catch {
    // No usable emitter (non-Lynx host / tests) — the iframe has no way to
    // reach us, which the caller treats as page unavailability.
  }
}

/** Test hook: drop the memoised module and re-arm listener installation. */
export function resetWebviewModuleForTests(): void {
  cached = null
  bridgeHandlers = null
  listenersInstalled = false
}
