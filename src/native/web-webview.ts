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
 * Everything flows one way through the module (open / move / postMessage /
 * close); the iframe's own traffic comes back as global events, subscribed via
 * {@link setWebviewBridgeHandlers}.
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
  open(url: string, selector: string): void
  postMessage(json: string): void
  close(): void
}

const NATIVE_METHODS = ['open', 'postMessage', 'close'] as const

function readNative(): SongloftWebviewNativeModule | null {
  const mod = readNativeModules()?.SongloftWebview as Record<string, unknown> | undefined
  if (!mod) return null
  // A partial module is worse than none: `mod?.method?.()` would turn the
  // missing half into a silent no-op — for `close` that leaks an iframe over
  // the app every time the plugin page is left. Same rule as `navigation.ts`.
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
    open(url, selector) {
      try {
        native.open(url, selector)
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
    close() {
      try {
        native.close()
      } catch {
        // Worst case the iframe lingers until reload.
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
