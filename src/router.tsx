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
import { AddSongsPage, CategorySongsPage, LibraryPage, PlayHistoryPage, SongDetailPage } from './features/library/index.js'
import { PlaylistDetailPage } from './features/playlist/index.js'
import { HomePage } from './features/home/index.js'
import { CacheManagePage, EqualizerPage, ProxySettingsPage, ServerEditPage, ServerListPage, ServerSettingsPage, SettingsPage, ThemePacksPage, UpgradePage } from './features/settings/index.js'
import { DuplicateCheckPage, LibraryOpsPage } from './features/library-ops/index.js'
import { PluginManagerPage, PluginRegistryPage, PluginWebViewPage, TabConfigPage } from './features/jsplugin/index.js'
import { PlayerPage } from './routes/PlayerPage.js'
import { LyricEditPage } from './features/player/pages/LyricEditPage.js'
import { DlnaPage } from './features/player/pages/DlnaPage.js'

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

const lyricEditRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/player/lyrics/edit',
  component: LyricEditPage,
})

const dlnaRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/player/dlna',
  component: DlnaPage,
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
  component: HomePage,
})

const libraryRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/library',
  // `?view=` drives the active tab (songs/facets/playlists) so it survives
  // remounts and is restored when returning from the playlist detail page.
  // `view` / `field` are OPTIONAL so plain `navigate({ to: '/library' })` (shell
  // nav tab) stays valid and defaults to songs. `view` = active tab; `field` =
  // active facet dimension in the Categories tab — both URL-driven so returning
  // from a drill-in (category songs / playlist detail) restores the exact tab
  // AND facet field the user was on.
  validateSearch: (
    search: Record<string, unknown>,
  ): { view?: 'songs' | 'facets' | 'playlists'; field?: 'artist' | 'album' | 'genre' } => {
    const v = search.view
    const f = search.field
    return {
      ...(v === 'songs' || v === 'facets' || v === 'playlists' ? { view: v } : {}),
      ...(f === 'artist' || f === 'album' || f === 'genre' ? { field: f } : {}),
    }
  },
  component: LibraryPage,
})

const settingsRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/settings',
  component: SettingsPage,
})

/** `/settings/server` — standalone server-address sub-page, inside the shell. */
const serverSettingsRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/settings/server',
  component: ServerSettingsPage,
})

/** `/settings/servers` — multi-server list page, inside the shell. */
const serverListRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/settings/servers',
  component: ServerListPage,
})

/** `/settings/servers/add` — add new server page, inside the shell. */
const serverAddRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/settings/servers/add',
  component: ServerEditPage,
})

/** `/settings/servers/edit/$id` — edit server page, inside the shell. */
const serverEditRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/settings/servers/edit/$id',
  component: ServerEditPage,
})

/** `/settings/library` — music-library operations (scan) sub-page, inside the shell (batch 19). */
const libraryOpsRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/settings/library',
  component: LibraryOpsPage,
})

/** `/settings/cache` — cache management sub-page, inside the shell. */
const cacheManageRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/settings/cache',
  component: CacheManagePage,
})

/** `/settings/eq` — equalizer sub-page, inside the shell. */
const equalizerRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/settings/eq',
  component: EqualizerPage,
})

/** `/settings/proxy` — proxy configuration sub-page, inside the shell. */
const proxySettingsRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/settings/proxy',
  component: ProxySettingsPage,
})

const themePacksRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/settings/theme-packs',
  component: ThemePacksPage,
})

const upgradeRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/settings/upgrade',
  component: UpgradePage,
})

/** `/settings/duplicates` — duplicate detection sub-page, inside the shell. */
const duplicatesRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/settings/duplicates',
  component: DuplicateCheckPage,
})

/** `/settings/plugins` — plugin manager sub-page, inside the shell (batch 17). */
const pluginsRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/settings/plugins',
  component: PluginManagerPage,
})

/** `/settings/plugins/registry` — plugin store/marketplace, inside the shell (batch 17). */
const pluginRegistryRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/settings/plugins/registry',
  component: PluginRegistryPage,
})

/** `/plugin/$entryPath` — plugin webview page, inside the shell (batch 18). */
const pluginWebViewRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/plugin/$entryPath',
  component: PluginWebViewPage,
})

/** `/settings/tab-config` — tab configuration page, inside the shell (batch 18). */
const tabConfigRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/settings/tab-config',
  component: TabConfigPage,
})

/** `/playlists/$id` — playlist detail, inside the shell (batch 6). */
const playlistDetailRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/playlists/$id',
  component: PlaylistDetailPage,
})

/**
 * `/library/category/$field` — Categories facet drill-in (songs in a dimension
 * value), inside the shell. `value` (the facet value) is required; `cover` is
 * optional. Both are declared OPTIONAL in the return type so the drill-in is the
 * only caller that must supply them — no other `navigate` targets this route, so
 * this keeps `validateSearch` from making unrelated navigations type-invalid
 * (same pattern as `libraryRoute`).
 */
/** `/library/history` — play history page, inside the shell. */
const playHistoryRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/library/history',
  component: PlayHistoryPage,
})

const categorySongsRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/library/category/$field',
  validateSearch: (
    search: Record<string, unknown>,
  ): { value?: string; cover?: string } => {
    const value = typeof search.value === 'string' ? search.value : ''
    const cover = typeof search.cover === 'string' ? search.cover : undefined
    return cover ? { value, cover } : { value }
  },
  component: CategorySongsPage,
})

const songDetailRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/library/song/$songId',
  component: SongDetailPage,
})

const addSongsRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/library/add',
  component: AddSongsPage,
})

const routeTree = rootRoute.addChildren([
  loginRoute,
  playerRoute,
  lyricEditRoute,
  dlnaRoute,
  shellRoute.addChildren([
    listRoute,
    libraryRoute,
    settingsRoute,
    serverSettingsRoute,
    serverListRoute,
    serverAddRoute,
    serverEditRoute,
    libraryOpsRoute,
    cacheManageRoute,
    equalizerRoute,
    proxySettingsRoute,
    themePacksRoute,
    upgradeRoute,
    duplicatesRoute,
    pluginsRoute,
    pluginRegistryRoute,
    pluginWebViewRoute,
    tabConfigRoute,
    playlistDetailRoute,
    playHistoryRoute,
    categorySongsRoute,
    songDetailRoute,
    addSongsRoute,
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
