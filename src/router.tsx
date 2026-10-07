import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  redirect,
  useRouterState,
} from '@tanstack/react-router'
import { Component } from '@lynx-js/react'
import type { ReactNode } from '@lynx-js/react'

import { ensureRouterEnv } from './shims/router-env.js'
import { ShellLayout } from './shared/layouts/ShellLayout.js'
import { ThemeProvider } from './shared/theme/ThemeProvider.js'
import { SongRowOverlays } from './shared/ui/SongRowOverlays.js'
import { SplashScreen } from './shared/ui/SplashScreen.js'
import { ToastHost } from './shared/ui/ToastHost.js'
import { AudioTrackSheet } from './features/player/widgets/AudioTrackSheet.js'
import { UpdateStartup } from './core/updater/UpdateStartup.js'
import { reportUpdateStartupFailure } from './core/updater/native-updater.js'

/** Catches render errors in the route tree so the whole app does not go blank. */
class RouteErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false }

  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true }
  }

  componentDidCatch(error: unknown) {
    reportUpdateStartupFailure()
    // eslint-disable-next-line no-console
    console.error('[RouteErrorBoundary]', error)
  }

  render() {
    if (this.state.hasError) {
      return (
        <view
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'var(--system-background)',
          }}
        >
          <text style={{ color: 'var(--label)', fontSize: '16px' }}>
            {'发生错误，请重试'}
          </text>
        </view>
      )
    }
    return this.props.children
  }
}
import { evaluateAuthGuard, isAuthTransitionPending, useAuthStore } from './features/auth/store/index.js'
import { LoginPage } from './features/auth/pages/LoginPage.js'
import { AddSongsPage, CategorySongsPage, FolderContentPage, LibraryLayout, LibraryPage, TagSongsPage } from './features/library/index.js'
import { migrateLibrarySearch, type LibraryViewKey } from './features/library/domain/library-views.js'
import { CreatePlaylistPage, EditPlaylistPage, PlaylistDetailPage } from './features/playlist/index.js'
import { HomePage } from './features/home/index.js'
import { AboutPage, AppearancePage, CacheManagePage, DataPage, DiagnosticsPage, LicensesPage, PlaybackPage, ProxySettingsPage, ServerEditPage, ServerListPage, SettingsPage, ThemeCatalogPage } from './features/settings/index.js'
import { DuplicateCheckPage, LibraryOpsPage } from './features/library-ops/index.js'
import { PluginManagerPage, PluginRegistryPage, GithubDiscoveryPage, PluginWebViewPage, TabConfigPage } from './features/jsplugin/index.js'
import { DemoFramePage } from './features/jsplugin/pages/DemoFramePage.js'
import { PlayerPage } from './routes/PlayerPage.js'
import { EqualizerPage } from './features/player/pages/EqualizerPage.js'
import { FullVideoPage } from './features/player/pages/FullVideoPage.js'
import { LyricAdjustPage } from './features/player/pages/LyricAdjustPage.js'
import { DlnaPage } from './features/player/pages/DlnaPage.js'
import { CacheTasksPage } from './features/player/pages/CacheTasksPage.js'
import { DeviceCachePage } from './features/player/pages/DeviceCachePage.js'
import { useOfflineOwner } from './features/player/widgets/use-offline-owner.js'
import { currentOfflineOwner } from './features/player/data/offline-identity.js'
import { cachedSongIdentity } from './features/player/domain/offline-cache.js'
import { usePlayerStore } from './features/player/store/player-store.js'

function offlinePlaybackAllowed(): boolean {
  const song = usePlayerStore.getState().currentSong
  const identity = song ? cachedSongIdentity(song) : null
  return identity !== null && identity.namespace === currentOfflineOwner()?.namespace
}

/**
 * Batch 1 uses code-based route definitions (no file-based codegen plugin) to
 * keep the walking skeleton low-risk. The directory is still `src/routes/` so a
 * later migration to file-based routing stays mechanical.
 */
/**
 * Root view: the launch splash while auth is unresolved or a guard redirect is
 * in flight, the real tree otherwise (`isAuthTransitionPending`). Holding the
 * splash during those gaps is what stops the Web-refresh "login page flashes
 * and jumps to home" bug at the render layer: the route guard lets `unknown`
 * through by design, and `router.invalidate()` lands a redirect only through a
 * promise chain — without this gate both gaps paint the soon-to-be-abandoned
 * route.
 *
 * The route guard (`beforeLoad` below) stays the single source of *where* to
 * go; this view only decides *whether to show the trip at all*.
 */
export function RootRouteView() {
  const status = useAuthStore((s) => s.status)
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  useOfflineOwner()
  usePlayerStore(s => s.currentSong)

  if (isAuthTransitionPending(status, pathname, offlinePlaybackAllowed())) {
    return (
      <ThemeProvider>
        <SplashScreen />
      </ThemeProvider>
    )
  }

  return (
    <ThemeProvider>
      <RouteErrorBoundary>
        <Outlet />
        <UpdateStartup />
      </RouteErrorBoundary>
      {/*
        Global toast renderer. Mounted here (inside ThemeProvider so CSS vars
        resolve, and after <Outlet/> so DOM order paints it above every page —
        Lynx has no z-index) rather than in the shell, so chrome-less routes
        (/player, /login, lyrics adjust, dlna) get toasts too.
      */}
      <ToastHost />
      {/**
        * The song-row overlays: context menu, add-to-playlist sheet, delete
        * confirm and the info/edit dialogs. Same two reasons as ToastHost,
        * plus one more: it used to be a sibling of <RouterProvider> in
        * App.tsx — fine on native, but on Web that left it outside
        * `.theme-root` (every `var(--*)` resolved to empty: the dialog
        * rendered unstyled and unclickable).
        */}
      <SongRowOverlays />
      <AudioTrackSheet />
    </ThemeProvider>
  )
}

const rootRoute = createRootRoute({
  // Auth guard: runs on every navigation before the matched route loads. The
  // decision is a pure function (`evaluateAuthGuard`) reading the *vanilla*
  // auth store (no React) — `unknown` never redirects, so the pre-`checkAuth`
  // mount is not wrongly kicked. Mirrors the Flutter GoRouter `redirect`.
  beforeLoad: ({ location }) => {
    const target = evaluateAuthGuard(
      useAuthStore.getState().status,
      location.pathname,
      offlinePlaybackAllowed(),
    )
    if (target) throw redirect({ to: target })
  },
  component: RootRouteView,
})

/** `/login` — chrome-less, not wrapped by the shell. */
const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  component: LoginPage,
})

const deviceCacheRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/device-cache',
  component: DeviceCachePage,
})

/** `/player` — chrome-less, not wrapped by the shell. */
const playerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/player',
  component: PlayerPage,
})

/**
 * `/player/lyrics/adjust` — lyric timing adjustment (global offset + per-line
 * nudge), chrome-less like its sibling player pages.
 */
const lyricAdjustRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/player/lyrics/adjust',
  component: LyricAdjustPage,
})

const dlnaRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/player/dlna',
  component: DlnaPage,
})

/** `/player/eq` — chrome-less equalizer full-screen page, sibling to /player. */
const equalizerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/player/eq',
  component: EqualizerPage,
})

/**
 * `/player/video` — fullscreen picture with a JS-only control layer. The route's
 * background is transparent so the host's SurfaceView (under the Lynx view) is
 * the backdrop; the page only paints the close control above it.
 */
const fullVideoRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/player/video',
  component: FullVideoPage,
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
 * Its children are every route the library owns — the forms and detail
 * pages included, so the rail stays put while you drill from a facet grid
 * into an artist and on into a song. Their own headers (back arrow + title) live
 * inside the pane and are unaffected.
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

/** `/settings/appearance` — theme + theme packs + language sub-page, inside the shell. */
const appearanceRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/settings/appearance',
  component: AppearancePage,
})

/**
 * `/settings/theme-catalog` — the online theme store, entered from the
 * theme-pack card on `/settings/appearance`, inside the shell.
 */
const themeCatalogRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/settings/theme-catalog',
  component: ThemeCatalogPage,
})

/** `/settings/playback` — quality / auto-resume / normalization, inside the shell. */
const playbackRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/settings/playback',
  component: PlaybackPage,
})

/** `/settings/data` — playlist export / import, inside the shell. */
const dataRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/settings/data',
  component: DataPage,
})

/** `/settings/about` — versions, server, project, backend update and licenses, inside the shell. */
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

const cacheTasksRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/settings/cache-tasks',
  component: CacheTasksPage,
})

/** `/settings/proxy` — proxy configuration sub-page, inside the shell. */
const proxySettingsRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/settings/proxy',
  component: ProxySettingsPage,
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

const githubDiscoveryRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/settings/plugins/registry/github',
  component: GithubDiscoveryPage,
})

/**
 * `/plugin/$entryPath` — plugin webview page, inside the shell (batch 18).
 *
 * `?tab=true` marks an entry **through the nav tab** (bar, rail, or the More
 * sheet): a plugin that *is* a tab renders chromeless — no topbar, `embed` in
 * the URL — exactly like Flutter's `plugin_tab_page`. Every other entry
 * (plugin grid, manager, links) is a pushed page with the topbar +
 * open-in-browser action of Flutter's `plugin_webview_page`. The flag travels
 * in the search string rather than being derived from the tab config, because
 * "this navigation came from a tab" and "this plugin is configured as a tab"
 * are different questions — opening a tabbed plugin from the grid must keep
 * its topbar. Same optional-return pattern as `categorySongsRoute` above, so
 * only the tab entries have to supply it.
 * `?from=manager` records the installed-list entry so the shared back policy
 * returns to `/settings/plugins` rather than the last Home/Library tab.
 */
const pluginWebViewRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/plugin/$entryPath',
  validateSearch: (search: Record<string, unknown>): { tab?: boolean; from?: 'manager' } => ({
    ...(search.tab === true ? { tab: true } : {}),
    ...(search.from === 'manager' ? { from: 'manager' as const } : {}),
  }),
  component: PluginWebViewPage,
})

/** `/settings/tab-config` — tab configuration page, inside the shell (batch 18). */
const tabConfigRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/settings/tab-config',
  component: TabConfigPage,
})

/** `/demo-frame` — Phase 0 验证：<frame> 加载子 bundle (临时路由，验证后删除). */
const demoFrameRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/demo-frame',
  component: DemoFramePage,
})

/** `/playlists/$id` — playlist detail, inside the shell (batch 6). */
const playlistDetailRoute = createRoute({
  getParentRoute: () => libraryLayoutRoute,
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
  getParentRoute: () => libraryLayoutRoute,
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

/** `/library/tags/$tagId` — tag songs drill-in (songs under a custom tag). */
const tagSongsRoute = createRoute({
  getParentRoute: () => libraryLayoutRoute,
  path: '/library/tags/$tagId',
  validateSearch: (
    search: Record<string, unknown>,
  ): { name?: string; cover?: string } => {
    const name = typeof search.name === 'string' ? search.name : ''
    const cover = typeof search.cover === 'string' ? search.cover : undefined
    return cover ? { name, cover } : { name }
  },
  component: TagSongsPage,
})

/** `/library/folders` — folder browse drill-in (songs/subfolders under a path). */
const folderContentRoute = createRoute({
  getParentRoute: () => libraryLayoutRoute,
  path: '/library/folders',
  validateSearch: (
    search: Record<string, unknown>,
  ): { path?: string } => {
    const path = typeof search.path === 'string' ? search.path : ''
    return path ? { path } : {}
  },
  component: FolderContentPage,
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

/** `/playlists/$id/edit` — playlist edit form (batch 6+): back goes to the detail page. */
const editPlaylistRoute = createRoute({
  getParentRoute: () => libraryLayoutRoute,
  path: '/playlists/$id/edit',
  validateSearch: (search: Record<string, unknown>): { coverOnly?: boolean } =>
    search.coverOnly === true ? { coverOnly: true } : {},
  component: EditPlaylistPage,
})

const routeTree = rootRoute.addChildren([
  loginRoute,
  deviceCacheRoute,
  playerRoute,
  lyricAdjustRoute,
  dlnaRoute,
  equalizerRoute,
  fullVideoRoute,
  shellRoute.addChildren([
    listRoute,
    libraryLayoutRoute.addChildren([
      libraryRoute,
      addSongsRoute,
      createPlaylistRoute,
      editPlaylistRoute,
      categorySongsRoute,
      tagSongsRoute,
      folderContentRoute,
      playlistDetailRoute,
    ]),
    settingsRoute,
    appearanceRoute,
    playbackRoute,
    dataRoute,
    aboutRoute,
    diagnosticsRoute,
    serverListRoute,
    serverAddRoute,
    serverEditRoute,
    libraryOpsRoute,
    cacheManageRoute,
    cacheTasksRoute,
    proxySettingsRoute,
    themeCatalogRoute,
    licensesRoute,
    duplicatesRoute,
    pluginsRoute,
    pluginRegistryRoute,
    githubDiscoveryRoute,
    pluginWebViewRoute,
    tabConfigRoute,
    demoFrameRoute,
  ]),
])

export function createAppRouter(initialEntries: string[] = ['/']) {
  // Boot at `/` rather than `/login`: on an authenticated refresh the login
  // subtree then never enters the element tree, so the Web main thread's
  // insert-new-before-remove-old element swap has no login nodes left to
  // flash for a frame or two while the `/login → /` redirect lands. An
  // unauthenticated boot still ends up on `/login` — the guard redirects
  // once `checkAuth()` settles. Memory history cannot read the browser URL,
  // so this default is the only place the launch route is chosen.
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
