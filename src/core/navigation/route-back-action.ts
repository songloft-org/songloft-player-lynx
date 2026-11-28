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
import type { HistoryState } from '@tanstack/react-router'
import { getLastLibrarySearch } from '../../features/library/data/last-library-search.js'
import { isLibraryViewKey } from '../../features/library/domain/library-views.js'
import {
  getLastContentLocation,
  getLastShellLocation,
  getNavPaths,
} from '../../shared/nav/shell-navigation.js'
import { pluginRouteLocation, resolveRouteBack, type BackAction, type PluginRouteLocation } from '../../shared/nav/route-back.js'
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

interface PlayerRouteState extends HistoryState {
  playerReturnPlugin?: PluginRouteLocation
  videoReturnPlugin?: PluginRouteLocation
}

function preparePluginRoute(entryPath: string) {
  const router = appRouter
  const location = router?.state.location
  if (!router || !location) return undefined
  const origin = pluginRouteLocation(location.pathname, location.search)
  if (!origin || origin.entryPath !== entryPath) return undefined

  return {
    router,
    origin,
    isCurrent: () => router.state.location === location,
  }
}

export function preparePluginPlayerUi(entryPath: string) {
  const route = preparePluginRoute(entryPath)
  if (!route) return undefined
  return {
    isCurrent: route.isCurrent,
    openPlayer: () => route.router.navigate({
      to: '/player',
      state: (): PlayerRouteState => ({ playerReturnPlugin: route.origin }),
    }),
  }
}

export function preparePluginVideoRoute(entryPath: string) {
  const route = preparePluginRoute(entryPath)
  if (!route) return undefined
  return {
    isCurrent: route.isCurrent,
    open: () => route.router.navigate({
      to: '/player/video',
      state: (): PlayerRouteState => ({ videoReturnPlugin: route.origin }),
    }),
  }
}

/** What back would do from where the router currently is. */
export function currentBackAction(): BackAction | null {
  const router = appRouter
  if (!router) return null
  const location = router.state.location
  const state = location.state as PlayerRouteState | undefined
  return resolveRouteBack(location.pathname, {
    navPaths: getNavPaths(),
    playerReturnPlugin: state?.playerReturnPlugin,
    videoReturnPlugin: state?.videoReturnPlugin,
    // A plugin page entered through its nav tab (`?tab=true`) is a tab root;
    // the same pathname pushed from the grid / manager is a sub-page. See
    // `RouteBackContext.pluginTabEntry`.
    pluginTabEntry:
      location.pathname.startsWith('/plugin/')
      && (location.search as { tab?: unknown }).tab === true,
    pluginManagerEntry:
      location.pathname.startsWith('/plugin/')
      && (location.search as { from?: unknown }).from === 'manager',
    lastShellLocation: getLastShellLocation(),
    lastContentLocation: getLastContentLocation() ?? undefined,
    lastLibrarySearch: getLastLibrarySearch(),
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
  if (action.kind === 'navigate' && action.plugin) {
    void router.navigate({
      to: '/plugin/$entryPath',
      params: { entryPath: action.plugin.entryPath },
      search: action.plugin.search,
      replace: true,
    })
    return
  }
  if (action.to === '/library') {
    const view = 'librarySearch' in action ? action.librarySearch?.view : undefined
    void router.navigate({
      to: '/library',
      search: typeof view === 'string' && isLibraryViewKey(view) ? { view } : {},
    })
    return
  }
  // Returning the player to a source page with query params (a folder's ?path=,
  // a category's ?value=). TanStack validates search per-route, so the dynamic
  // object is cast at this single boundary; the values come straight from the
  // router's own last location and are re-validated by that route on arrival.
  if ('search' in action && action.search && Object.keys(action.search).length) {
    void router.navigate({ to: action.to, search: action.search } as unknown as Parameters<AppRouter['navigate']>[0])
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
