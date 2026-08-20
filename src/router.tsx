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
import { ToastHost } from './shared/ui/ToastHost.js'
import { evaluateAuthGuard, useAuthStore } from './features/auth/store/index.js'
import { LoginPage } from './features/auth/pages/LoginPage.js'
import { AddSongsPage, CategorySongsPage, LibraryLayout, LibraryPage, SongDetailPage } from './features/library/index.js'
import { migrateLibrarySearch, type LibraryViewKey } from './features/library/domain/library-views.js'
import { CreatePlaylistPage, PlaylistDetailPage } from './features/playlist/index.js'
import { HomePage } from './features/home/index.js'
import { AboutPage, AppearancePage, CacheManagePage, DataPage, DiagnosticsPage, EqualizerPage, LicensesPage, LyricsPage, PlaybackPage, ProxySettingsPage, ServerEditPage, ServerListPage, SettingsPage, ThemePacksPage, UpgradePage } from './features/settings/index.js'
import { DuplicateCheckPage, LibraryOpsPage } from './features/library-ops/index.js'
import { PluginManagerPage, PluginRegistryPage, PluginWebViewPage, TabConfigPage } from './features/jsplugin/index.js'
import { PlayerPage } from './routes/PlayerPage.js'
import { LyricEditPage } from './features/player/pages/LyricEditPage.js'
import { LyricCalibratePage } from './features/player/pages/LyricCalibratePage.js'
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
      {/*
        Global toast renderer. Mounted here (inside ThemeProvider so CSS vars
        resolve, and after <Outlet/> so DOM order paints it above every page —
        Lynx has no z-index) rather than in the shell, so chrome-less routes
        (/player, /login, lyrics edit/calibrate, dlna) get toasts too.
      */}
      <ToastHost />
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

const lyricCalibrateRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/player/lyrics/calibrate',
  component: LyricCalibratePage,
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

/**
 * Pathless layout route for the library section: it owns the wide-screen view
 * rail, so the rail is created once and survives navigation between the library
 * and its form pages instead of being re-created (and re-measured) by each of
 * them — that re-creation is what flashed on open. Adding no path segment keeps
 * every URL below unchanged, so `route-back.ts` needs no entry for it.
 *
 * `/library/category/$field`, `/library/song/$songId` and `/playlists/$id` stay
 * outside on purpose: they are full-bleed detail pages with their own headers and
 * have never shown the rail. Moving one under here later is a one-line change.
 */
const libraryLayoutRoute = createRoute({
  getParentRoute: () => shellRoute,
  id: 'library-layout',
  component: LibraryLayout,
})

const libraryRoute = createRoute({
  getParentRoute: () => libraryLayoutRoute,
  path: '/library',
  // `?view=<LibraryViewKey>` drives the active view (14-view model) so it
  // survives remounts and is restored when returning from a drill-in. `view`
  // is OPTIONAL so plain `navigate({ to: '/library' })` (shell nav) stays
  // valid and defaults to the first visible view. Old four-tab values
  // (`songs`/`facets`/`playlists` + `field`) are migrated, not rejected —
  // deep links and the shell's `getLastLibrarySearch()` restoration both pass
  // through here.
  validateSearch: (search: Record<string, unknown>): { view?: LibraryViewKey } =>
    migrateLibrarySearch(search),
  component: LibraryPage,
})

const settingsRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/settings',
  component: SettingsPage,
})

/** `/settings/appearance` — theme + language sub-page, inside the shell. */
const appearanceRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/settings/appearance',
  component: AppearancePage,
})

/** `/settings/playback` — quality / auto-resume / normalization, inside the shell. */
const playbackRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/settings/playback',
  component: PlaybackPage,
})

/**
 * `/settings/lyrics` — lyrics display + floating overlay, inside the shell.
 * Distinct from `/player/lyrics/edit` and `/player/lyrics/calibrate`, which hang
 * off the root route under `/player`.
 */
const lyricsSettingsRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/settings/lyrics',
  component: LyricsPage,
})

/** `/settings/data` — playlist export / import, inside the shell. */
const dataRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/settings/data',
  component: DataPage,
})

/** `/settings/about` — versions, server, project and licenses, inside the shell. */
const aboutRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/settings/about',
  component: AboutPage,
})

/** `/settings/diagnostics` — log level + log export, inside the shell. */
const diagnosticsRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/settings/diagnostics',
  component: DiagnosticsPage,
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

const licensesRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/settings/licenses',
  component: LicensesPage,
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
  getParentRoute: () => libraryLayoutRoute,
  path: '/library/add',
  component: AddSongsPage,
})

const createPlaylistRoute = createRoute({
  getParentRoute: () => libraryLayoutRoute,
  path: '/playlists/create',
  component: CreatePlaylistPage,
})

const routeTree = rootRoute.addChildren([
  loginRoute,
  playerRoute,
  lyricEditRoute,
  lyricCalibrateRoute,
  dlnaRoute,
  shellRoute.addChildren([
    listRoute,
    libraryLayoutRoute.addChildren([
      libraryRoute,
      addSongsRoute,
      createPlaylistRoute,
    ]),
    settingsRoute,
    appearanceRoute,
    playbackRoute,
    lyricsSettingsRoute,
    dataRoute,
    aboutRoute,
    diagnosticsRoute,
    serverListRoute,
    serverAddRoute,
    serverEditRoute,
    libraryOpsRoute,
    cacheManageRoute,
    equalizerRoute,
    proxySettingsRoute,
    themePacksRoute,
    upgradeRoute,
    licensesRoute,
    duplicatesRoute,
    pluginsRoute,
    pluginRegistryRoute,
    pluginWebViewRoute,
    tabConfigRoute,
    playlistDetailRoute,
    categorySongsRoute,
    songDetailRoute,
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
