// Import the ReactLynx testing-library env FIRST: it installs the runtime
// globals (incl. `lynx`) that the router's transitive ReactLynx runtime reads at
// import time. Loading it before anything that pulls that runtime avoids
// `ReferenceError: lynx is not defined` during collection.
import { act } from '@lynx-js/react/testing-library'
import { afterEach, beforeEach, expect, test } from 'vitest'

import { createAppRouter } from '../router.js'

/**
 * Regression for the on-device crash:
 *
 *   loadCard failed TypeError: undefined is not an object
 *   (evaluating 'self.__TSR_ROUTER__ = this')   // router-core RouterCore ctor
 *
 * On device, rspeedy resolves `@tanstack/router-core/isServer` via the `browser`
 * export condition, so the module-level `isServer` constant is `false` and the
 * `RouterCore` constructor unconditionally runs `self.__TSR_ROUTER__ = this`. The
 * Lynx background realm has `lynx` but no `self`/`window`/`document`, so it throws.
 *
 * Why the suite was green while the device crashed: the default Vitest env (and
 * jsdom) `happen to have` `self`, and Vitest resolves the `development` condition
 * (`isServer === undefined`) so the write is skipped whenever `document` is
 * absent. A per-file `node` environment is unusable here: importing the router
 * pulls the ReactLynx runtime, which reads the `lynx` global the testing-library
 * env injects. Instead we reproduce the device's *global shape* inside that env:
 * `lynx` present, `self`/`window`/`document` removed.
 */

// Keep the value import above (it triggers env init) even if unused elsewhere.
void act

const g = globalThis as Record<string, unknown>
const KEYS = ['self', 'window', 'document'] as const
const saved: Record<string, { had: boolean; value: unknown }> = {}
function stash(key: string) {
  saved[key] = { had: key in g, value: g[key] }
  try { delete g[key] } catch { g[key] = undefined }
}
beforeEach(() => { for (const k of KEYS) stash(k) })
afterEach(() => {
  for (const k of KEYS) {
    const s = saved[k]; if (!s) continue
    if (s.had) g[k] = s.value
    else try { delete g[k] } catch { g[k] = undefined }
  }
})

test('constructs the app router with no self/window/document (device shape)', () => {
  expect(typeof g.self).toBe('undefined')
  expect(typeof g.document).toBe('undefined')
  let router!: ReturnType<typeof createAppRouter>
  expect(() => { router = createAppRouter(['/login']) }).not.toThrow()
  expect(router.state.location.pathname).toBe('/login')
  expect(router.isServer).toBe(false)
})

test('survives the exact self.__TSR_ROUTER__ write path (self absent, document present)', () => {
  g.document = {}
  expect(typeof g.self).toBe('undefined')
  expect(() => createAppRouter(['/login'])).not.toThrow()
  expect((g.self as { __TSR_ROUTER__?: unknown }).__TSR_ROUTER__).toBeDefined()
})
