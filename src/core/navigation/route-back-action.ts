/**
 * The route-level back step, shared by the back key and every back arrow in the UI.
 *
 * Split out of `back-controller.ts` so a component can import it without pulling in
 * i18n, the toast store, the native module and the platform probe. Everything here
 * reaches only leaf modules, which keeps page render tests cheap.
 *
 * The router is **injected**: `router.tsx` imports every page, and pages reach this
 * module, so a static import would close that loop.
 */
import { getLastLibrarySearch } from '../../features/library/data/last-library-search.js'
import { isLibraryViewKey } from '../../features/library/domain/library-views.js'
import { getSongDetailOrigin, getSongEditOrigin } from '../../shared/nav/navigate-to-song-detail.js'
import {
  getLastShellLocation,
  getNavPaths,
} from '../../shared/nav/shell-navigation.js'
import { resolveRouteBack, type BackAction } from '../../shared/nav/route-back.js'
// `import type` of a *value* binding: erased at compile time, so the route tree is
// not imported at runtime and the cycle above never forms. Deliberately not
// `typeof import('…')` — `device-host-contract.test.ts` bans `import(` in `src/`,
// because a real dynamic import emits a lazy bundle that never ships to the device.
import type { router as routerSingleton } from '../../router.js'

type AppRouter = typeof routerSingleton

let appRouter: AppRouter | null = null

/** Called once at startup by `initBackController`. */
export function setBackRouter(router: AppRouter): void {
  appRouter = router
}

export function getBackRouter(): AppRouter | null {
  return appRouter
}

/** What back would do from where the router currently is. */
export function currentBackAction(): BackAction | null {
  const router = appRouter
  if (!router) return null
  const location = router.state.location
  return resolveRouteBack(location.pathname, {
    navPaths: getNavPaths(),
    // A plugin page entered through its nav tab (`?tab=true`) is a tab root;
    // the same pathname pushed from the grid / manager is a sub-page. See
    // `RouteBackContext.pluginTabEntry`.
    pluginTabEntry:
      location.pathname.startsWith('/plugin/')
      && (location.search as { tab?: unknown }).tab === true,
    lastShellLocation: getLastShellLocation(),
    lastLibrarySearch: getLastLibrarySearch(),
    songDetailFrom: getSongDetailOrigin(),
    songEditFrom: getSongEditOrigin(),
  })
}

/**
 * Perform a navigate action.
 *
 * `/library` is special-cased so its search params stay type-checked — it is the
 * only back target that carries any, and a widened `to` would erase the router's
 * literal-path typing for every other target.
 */
function navigateTo(
  router: AppRouter,
  action: Extract<BackAction, { kind: 'navigate' | 'fallback' }>,
): void {
  if (action.to === '/library') {
    const view = 'librarySearch' in action ? action.librarySearch?.view : undefined
    void router.navigate({
      to: '/library',
      search: typeof view === 'string' && isLibraryViewKey(view) ? { view } : {},
    })
    return
  }
  void router.navigate({ to: action.to })
}

/**
 * Go to the current route's declared parent.
 *
 * Returns false only at a tab root, where there is no parent. A back *arrow* can
 * ignore that (a page showing one always has a parent); the back *key* turns it into
 * the "press again to exit" prompt.
 */
export function performRouteBack(): boolean {
  const router = appRouter
  const action = currentBackAction()
  if (!router || !action) return false
  if (action.kind === 'exit-prompt') return false
  if (action.kind === 'fallback') {
    // Loud on purpose: `route-back.test.ts` walks every leaf route and asserts this
    // branch is unreachable, so reaching it means a route was added without a
    // declared parent.
    console.warn(
      `[back] no declared parent for "${router.state.location.pathname}" — falling back `
      + `to "${action.to}". Add it to shared/nav/route-back.ts.`,
    )
  }
  navigateTo(router, action)
  return true
}

/** Test hook: module state outlives `render()`. */
export function resetBackRouterForTests(): void {
  appRouter = null
}
