import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  redirect,
} from '@tanstack/react-router'

import { ensureRouterEnv } from './shims/router-env.js'
import { ShellLayout } from './shared/layouts/ShellLayout.js'
import { ThemeProvider } from './shared/theme/ThemeProvider.js'
import { evaluateAuthGuard, useAuthStore } from './features/auth/store/index.js'
import { LoginPage } from './features/auth/pages/LoginPage.js'
import { LibraryPage } from './features/library/index.js'
import { PlaylistDetailPage } from './features/playlist/index.js'
import { ListPage } from './routes/ListPage.js'
import { PlayerPage } from './routes/PlayerPage.js'
import { SettingsPage } from './routes/SettingsPage.js'

/**
 * Batch 1 uses code-based route definitions (no file-based codegen plugin) to
 * keep the walking skeleton low-risk. The directory is still `src/routes/` so a
 * later migration to file-based routing stays mechanical.
 */
const rootRoute = createRootRoute({
  // Auth guard: runs on every navigation before the matched route loads. The
  // decision is a pure function (`evaluateAuthGuard`) reading the *vanilla*
  // auth store (no React) — `unknown` never redirects, so the pre-`checkAuth`
  // mount is not wrongly kicked. Mirrors the Flutter GoRouter `redirect`.
  beforeLoad: ({ location }) => {
    const target = evaluateAuthGuard(
      useAuthStore.getState().status,
      location.pathname,
    )
    if (target) throw redirect({ to: target })
  },
  component: () => (
    <ThemeProvider>
      <Outlet />
    </ThemeProvider>
  ),
})

/** `/login` — chrome-less, not wrapped by the shell. */
const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  component: LoginPage,
})

/** `/player` — chrome-less, not wrapped by the shell. */
const playerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/player',
  component: PlayerPage,
})

/** Pathless layout route: everything under it renders inside the shell. */
const shellRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'shell',
  component: ShellLayout,
})

const listRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/',
  component: ListPage,
})

const libraryRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/library',
  component: LibraryPage,
})

const settingsRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/settings',
  component: SettingsPage,
})

/** `/playlists/$id` — playlist detail, inside the shell (batch 6). */
const playlistDetailRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/playlists/$id',
  component: PlaylistDetailPage,
})

const routeTree = rootRoute.addChildren([
  loginRoute,
  playerRoute,
  shellRoute.addChildren([
    listRoute,
    libraryRoute,
    settingsRoute,
    playlistDetailRoute,
  ]),
])

export function createAppRouter(initialEntries: string[] = ['/login']) {
  // The Lynx background realm has no `self`/`window`. router-core's client branch
  // writes `self.__TSR_ROUTER__ = this` during construction (router-core@1.171
  // router.ts:1152) whenever its *module-level* `isServer` constant is `false` —
  // which is exactly how rspeedy resolves `@tanstack/router-core/isServer` for
  // Lynx (the `browser` export condition). That line reads the bundled constant,
  // NOT `options.isServer`, so we cannot switch it off via options; we must make
  // `self` exist. Do it here, in the same module/realm/thread that constructs the
  // router and immediately before construction, so it is immune to import-order,
  // tree-shaking, and the main/background thread realm split (a side-effect-only
  // `import './shims/router-env.js'` was not reliable on device).
  ensureRouterEnv()

  return createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries }),
    // Keep the client (non-DOM) branch and never enter SSR code paths. This is
    // load-bearing: environments that resolve `@tanstack/router-core/isServer`
    // via the `development`/`node` condition see `isServer === undefined`, so
    // omitting this option would make `this.isServer` fall back to
    // `typeof document === 'undefined'` (true on Lynx) and push the router into
    // the SSR branch (loadServerRoute / __TSR_CACHE__ / route.ssr). It does NOT
    // affect the `self.__TSR_ROUTER__` write above — `ensureRouterEnv()` does.
    isServer: false,
    defaultPreload: false,
    // Lynx has no scroll-restoration DOM APIs.
    scrollRestoration: false,
  })
}

export const router = createAppRouter()

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
