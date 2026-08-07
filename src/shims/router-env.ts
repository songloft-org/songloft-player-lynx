/**
 * Compatibility shims for running TanStack Router in the Lynx runtime.
 *
 * Lynx has no DOM: there is no `window`, `document` or `self`. TanStack Router's
 * client build assumes a browser and, during router construction, touches a few
 * globals unconditionally. In particular `router-core` writes
 * `self.__TSR_ROUTER__ = this` in the `RouterCore` constructor whenever its
 * bundled `isServer` constant is `false` — which is exactly how rspeedy resolves
 * `@tanstack/router-core/isServer` for the Lynx target (the `browser` export
 * condition). With no `self` in the Lynx background realm this throws
 * `TypeError: undefined is not an object (evaluating 'self.__TSR_ROUTER__ = this')`.
 *
 * We satisfy those probes with the ambient `globalThis` object. We deliberately
 * DO NOT define `document`: many of TanStack's DOM code paths are guarded by
 * `typeof document === 'undefined'`, so leaving `document` undefined keeps the
 * router on the non-DOM branch and away from browser-only behaviour.
 *
 * `ensureRouterEnv()` is idempotent and must run in the SAME realm/thread that
 * constructs the router, immediately before construction. A side-effect-only
 * `import './router-env.js'` is NOT enough on real devices (it is fragile to
 * import-order, tree-shaking, and the main/background thread realm split), so
 * `createAppRouter` calls this directly — see `src/router.tsx`.
 */
import 'url-search-params-polyfill'

const g = globalThis as unknown as {
  self?: unknown
  window?: unknown
  scrollTo?: unknown
  scrollX?: unknown
  scrollY?: unknown
}

/**
 * Ensure the browser globals TanStack Router touches during construction exist
 * on `globalThis`. Idempotent: safe to call on every `createAppRouter()`.
 */
export function ensureRouterEnv(): void {
  if (typeof g.self === 'undefined') {
    g.self = globalThis
  }

  if (typeof g.window === 'undefined') {
    g.window = globalThis
  }

  // TanStack Router calls `scrollTo(...)` when resetting scroll on navigation.
  // Lynx has no window scroll; provide a harmless no-op so navigation succeeds.
  if (typeof g.scrollTo === 'undefined') {
    g.scrollTo = () => {}
  }
  if (typeof g.scrollX === 'undefined') {
    g.scrollX = 0
  }
  if (typeof g.scrollY === 'undefined') {
    g.scrollY = 0
  }
}

// Also run on import so existing side-effect imports (`import './router-env.js'`)
// keep working for entry points that load this module before the router.
ensureRouterEnv()
