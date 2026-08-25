import { afterEach, describe, expect, test, vi } from 'vitest'

import {
  getWebviewModule,
  resetWebviewModuleForTests,
  setWebviewBridgeHandlers,
  WEBVIEW_MESSAGE_EVENT,
  WEBVIEW_OPEN_FAILED_EVENT,
} from '../web-webview.js'

/**
 * Probing and bridging of `NativeModules.SongloftWebview`.
 *
 * The failure these pin is the one `navigation.ts` documents: a partial module
 * is worse than none, because `mod?.method?.()` swallows the missing half as a
 * silent no-op — and for this module the missing half is `close`, which leaks a
 * main-thread iframe over the app every time the plugin page is left.
 */

function fullModule() {
  return {
    open: vi.fn(),
    postMessage: vi.fn(),
    close: vi.fn(),
  }
}

function installModule(mod: unknown): void {
  ;(globalThis as Record<string, unknown>).NativeModules = { SongloftWebview: mod }
}

/**
 * A `lynx` double whose GlobalEventEmitter records listeners, so events are
 * emitted exactly as the host delivers them (`sendGlobalEvent(name, [payload])`
 * → the listener's first argument).
 */
function installLynxDouble() {
  const listeners = new Map<string, Array<(...args: unknown[]) => void>>()
  const emitter = {
    addListener: (name: string, fn: (...args: unknown[]) => void) => {
      const list = listeners.get(name) ?? []
      list.push(fn)
      listeners.set(name, list)
    },
    removeListener: () => {},
  }
  ;(globalThis as Record<string, unknown>).lynx = {
    getJSModule: (name: string) => (name === 'GlobalEventEmitter' ? emitter : null),
  }
  return {
    emit(name: string, payload: unknown) {
      for (const fn of listeners.get(name) ?? []) fn(payload)
    },
    listenerCount: (name: string) => (listeners.get(name) ?? []).length,
  }
}

afterEach(() => {
  resetWebviewModuleForTests()
  delete (globalThis as Record<string, unknown>).NativeModules
  delete (globalThis as Record<string, unknown>).lynx
  vi.clearAllMocks()
})

describe('module probing', () => {
  test('a complete module is adapted and memoised', () => {
    const native = fullModule()
    installModule(native)
    const first = getWebviewModule()
    expect(first.available).toBe(true)
    // The real adapter is memoised — one probe per session, like navigation.
    expect(getWebviewModule()).toBe(first)
  })

  test('a partial module is rejected as a whole', () => {
    const native = fullModule()
    delete (native as Record<string, unknown>).close
    installModule(native)
    const mod = getWebviewModule()
    expect(mod.available).toBe(false)
    // The stub must be inert: calling close() on it may not throw, and must not
    // have reached the (close-less) native object.
    mod.close()
    expect(native.open).not.toHaveBeenCalled()
  })

  test.each(['open', 'postMessage'])(
    'a module missing only %s is rejected too',
    (missing) => {
      const native = fullModule()
      delete (native as Record<string, unknown>)[missing]
      installModule(native)
      expect(getWebviewModule().available).toBe(false)
    },
  )

  test('no module at all yields the unavailable stub', () => {
    installModule(undefined)
    expect(getWebviewModule().available).toBe(false)
  })

  test('the stub is not memoised — a late NativeModules is re-probed', () => {
    ;(globalThis as Record<string, unknown>).NativeModules = {}
    expect(getWebviewModule().available).toBe(false)
    installModule(fullModule())
    expect(getWebviewModule().available).toBe(true)
  })
})

describe('the adapter forwards every call', () => {
  test('open / postMessage / close reach the native module', () => {
    const native = fullModule()
    installModule(native)
    const mod = getWebviewModule()
    mod.open('http://server/api/v1/jsplugin/lx/', '#plugin-webview-frame')
    mod.postMessage('{"type":"songloft-theme"}')
    mod.close()
    expect(native.open).toHaveBeenCalledWith(
      'http://server/api/v1/jsplugin/lx/',
      '#plugin-webview-frame',
    )
    expect(native.postMessage).toHaveBeenCalledWith('{"type":"songloft-theme"}')
    expect(native.close).toHaveBeenCalled()
  })

  test('a throwing native call is swallowed, not propagated', () => {
    const native = fullModule()
    native.open.mockImplementation(() => {
      throw new Error('bridge gone')
    })
    installModule(native)
    const mod = getWebviewModule()
    // The page must survive a dead bridge; the other calls still go through.
    expect(() => mod.open('x', '#f')).not.toThrow()
    expect(() => mod.close()).not.toThrow()
  })
})

describe('bridge handlers', () => {
  test('message events reach the handler with the payload verbatim', () => {
    const d = installLynxDouble()
    const onMessage = vi.fn()
    setWebviewBridgeHandlers({ onMessage, onOpenFailed: vi.fn() })
    d.emit(WEBVIEW_MESSAGE_EVENT, { type: 'songloft-host-call', id: 'c1' })
    expect(onMessage).toHaveBeenCalledWith({ type: 'songloft-host-call', id: 'c1' })
  })

  test('openFailed reaches its handler', () => {
    const d = installLynxDouble()
    const onOpenFailed = vi.fn()
    setWebviewBridgeHandlers({ onMessage: vi.fn(), onOpenFailed })
    d.emit(WEBVIEW_OPEN_FAILED_EVENT, {})
    expect(onOpenFailed).toHaveBeenCalled()
  })

  test('a payload of undefined (array-contract violation) does not throw', () => {
    const d = installLynxDouble()
    setWebviewBridgeHandlers({ onMessage: vi.fn(), onOpenFailed: vi.fn() })
    expect(() => d.emit(WEBVIEW_MESSAGE_EVENT, undefined)).not.toThrow()
  })

  test('passing null detaches — later events reach nobody and do not throw', () => {
    const d = installLynxDouble()
    const onMessage = vi.fn()
    setWebviewBridgeHandlers({ onMessage, onOpenFailed: vi.fn() })
    setWebviewBridgeHandlers(null)
    d.emit(WEBVIEW_MESSAGE_EVENT, { type: 'songloft-host-call' })
    expect(onMessage).not.toHaveBeenCalled()
  })

  test('handlers are replaceable — a remounted page supersedes the old one', () => {
    const d = installLynxDouble()
    const first = vi.fn()
    setWebviewBridgeHandlers({ onMessage: first, onOpenFailed: vi.fn() })
    const second = vi.fn()
    setWebviewBridgeHandlers({ onMessage: second, onOpenFailed: vi.fn() })
    d.emit(WEBVIEW_MESSAGE_EVENT, {})
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
  })

  test('the global-event listeners are installed at most once', () => {
    const d = installLynxDouble()
    const make = () => ({ onMessage: vi.fn(), onOpenFailed: vi.fn() })
    setWebviewBridgeHandlers(make())
    setWebviewBridgeHandlers(make())
    expect(d.listenerCount(WEBVIEW_MESSAGE_EVENT)).toBe(1)
    expect(d.listenerCount(WEBVIEW_OPEN_FAILED_EVENT)).toBe(1)
  })

  test('no lynx host → the call is a harmless no-op', () => {
    // Tests and non-Lynx hosts have no GlobalEventEmitter; installing handlers
    // there must not throw (the page treats the silence as unavailability).
    expect(() =>
      setWebviewBridgeHandlers({ onMessage: vi.fn(), onOpenFailed: vi.fn() }),
    ).not.toThrow()
  })
})
