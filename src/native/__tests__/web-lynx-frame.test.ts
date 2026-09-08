import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import {
  getLynxFrameModule,
  resetLynxFrameModuleForTests,
} from '../web-lynx-frame.js'

/**
 * Probing of `NativeModules.SongloftLynxFrame`.
 *
 * The failure pinned here is the one `web-webview.ts` and `navigation.ts` document
 * and this facade adopted late: a partial module is worse than none. It became
 * reachable when `hide` was added, because `hide` runs in a React cleanup — with a
 * host page that predates it, `mod.hide(...)` is a TypeError thrown while
 * unmounting the plugin page. That host page is the normal case for anyone
 * upgrading from a build before 2026-09-08, when `lynx-frame-host.js` was still
 * missing from the deploy list altogether.
 */
function fullModule() {
  return {
    open: vi.fn(),
    updateGlobalProps: vi.fn(),
    sendEvent: vi.fn(),
    hostReply: vi.fn(),
    hide: vi.fn(),
    close: vi.fn(),
  }
}

const install = (mod: unknown): void => {
  ;(globalThis as Record<string, unknown>).NativeModules = { SongloftLynxFrame: mod }
}

beforeEach(() => { resetLynxFrameModuleForTests() })
afterEach(() => {
  delete (globalThis as Record<string, unknown>).NativeModules
  vi.clearAllMocks()
})

describe('module probing', () => {
  test('a complete module is adapted and memoised', () => {
    install(fullModule())
    const first = getLynxFrameModule()
    expect(first.available).toBe(true)
    expect(getLynxFrameModule()).toBe(first)
  })

  test.each(['open', 'updateGlobalProps', 'sendEvent', 'hostReply', 'hide', 'close'])(
    'a module missing only %s is rejected as a whole',
    (missing) => {
      const native = fullModule()
      delete (native as Record<string, unknown>)[missing]
      install(native)
      const mod = getLynxFrameModule()
      expect(mod.available).toBe(false)
      // The stub must be inert rather than reaching the incomplete native object.
      expect(() => mod.hide('alpha')).not.toThrow()
      expect(() => mod.close('alpha')).not.toThrow()
      expect(() => mod.open('u', '#s', '{}', 'alpha')).not.toThrow()
      for (const [name, spy] of Object.entries(native)) {
        expect(spy, `the stub reached native.${name}`).not.toHaveBeenCalled()
      }
    },
  )

  test('no module at all yields the unavailable stub', () => {
    install(undefined)
    expect(getLynxFrameModule().available).toBe(false)
  })

  test('the stub is not memoised — a late NativeModules is re-probed', () => {
    ;(globalThis as Record<string, unknown>).NativeModules = {}
    expect(getLynxFrameModule().available).toBe(false)
    install(fullModule())
    expect(getLynxFrameModule().available).toBe(true)
  })
})

describe('the adapter forwards every call', () => {
  test('the plugin key travels with open, hide and close', () => {
    const native = fullModule()
    install(native)
    const mod = getLynxFrameModule()
    mod.open('http://server/static/main.web.bundle', '#plugin-lynx-frame', '{}', 'alpha')
    mod.hide('alpha')
    mod.close('alpha')
    // Without the key the host would act on whichever child happens to be active.
    expect(native.open).toHaveBeenCalledWith(
      'http://server/static/main.web.bundle', '#plugin-lynx-frame', '{}', 'alpha',
    )
    expect(native.hide).toHaveBeenCalledWith('alpha')
    expect(native.close).toHaveBeenCalledWith('alpha')
  })

  test('a throwing native call is swallowed, not propagated', () => {
    const native = fullModule()
    native.hide.mockImplementation(() => { throw new Error('bridge gone') })
    install(native)
    const mod = getLynxFrameModule()
    // `hide` runs in a cleanup: a throw here unmounts the page mid-flight.
    expect(() => mod.hide('alpha')).not.toThrow()
    expect(() => mod.close('alpha')).not.toThrow()
  })
})
