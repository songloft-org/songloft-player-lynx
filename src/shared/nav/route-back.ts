/**
 * Route-level back policy: given a pathname, where does back go?
 *
 * This is the bottom of the back-key chain (below `back-stack`) **and** the
 * implementation behind every back arrow in the UI. Both call it, which is the
 * point: before this existed the 20-odd back targets lived one per page, and the
 * hardware key would have needed a second copy of all of them — two tables that
 * drift the moment someone adds a route.
 *
 * Being a pure function over a pathname makes the coverage gate real:
 * `__tests__/route-back.test.ts` walks the router's own leaf routes and asserts
 * none of them lands on {@link BackAction} `'fallback'`. A new route without an
 * entry here fails that test rather than silently exiting the app.
 *
 * Deliberately no `router.history.back()` anywhere: the memory history's first
 * entry is `/login`, *every* back arrow in this app pushes rather than pops, and
 * tab switches push too — so the history stack does not describe where the user
 * thinks they came from. `FullPlayerPage` documented this first; the policy here
 * generalises it.
 */

import { activeNavPath } from './shell-navigation.js'

/** Where a back press should go. `to` is a router path, never a history delta. */
export type BackAction =
  /**
   * Navigate. `librarySearch` is only meaningful when `to === '/library'`.
   * `search` carries an arbitrary source page's query params (e.g. a folder's
   * `?path=`) when returning the full-screen player to where it was opened.
   */
  | { kind: 'navigate'; to: string; librarySearch?: LibrarySearchLike; plugin?: PluginRouteLocation; search?: Record<string, unknown> }
  /** At a tab root: show "press again to exit", or exit if already armed. */
  | { kind: 'exit-prompt' }
  /**
   * No declared parent — a bug, not a state. The caller navigates to `to` (the
   * owning tab) so the user is never stranded and the app is never exited by
   * accident, and warns in dev. The gate exists to keep this unreachable.
   */
  | { kind: 'fallback'; to: string }

/**
 * Structurally typed so this module needs no import from `features/library`.
 * The caller narrows `view` to `LibraryViewKey` (it owns that type).
 */
export interface LibrarySearchLike {
  view?: string
}

export interface PluginRouteLocation {
  entryPath: string
  search: { tab?: boolean; from?: 'manager' }
}

export interface RouteBackContext {
  videoReturnPlugin?: PluginRouteLocation

  /**
   * Live tab roots — the three built-ins plus one per enabled plugin tab. Must
   * be the live list: a plugin tab's path is only known at runtime, and whether
   * `/plugin/foo` is a tab root decides between "exit prompt" and "go back".
   */
  navPaths: readonly string[]
  /**
   * Whether the current plugin page was entered **through its nav tab**
   * (`?tab=true`, set by the bar / rail / More sheet). A plugin configured as a
   * tab can still be *pushed* from the plugin grid or manager — there the page
   * has a topbar whose back arrow must return to the tab the user came from,
   * not offer to exit. `navPaths` alone cannot tell the two apart.
   */
  pluginTabEntry?: boolean
  /** Plugin opened from the installed list returns there after its internal history. */
  pluginManagerEntry?: boolean
  /** Plugin opened from the dual-column settings pane: back goes to `/settings`. */
  pluginPaneEntry?: boolean
  /** Which tab the shell was last on, for the chrome-less pages that return to it. */
  lastShellLocation: string
  /**
   * The last real content page the shell rendered (pathname + search). For the
   * full-screen player this is where the user actually came from, so it wins over
   * the tab root when returning from `/player`.
   */
  lastContentLocation?: { pathname: string; search: Record<string, unknown> }
  /** The library's last sub-view, so returning to it does not reset the view. */
  lastLibrarySearch: LibrarySearchLike
  /**
   * Query params of the *current* route. Only folder drill-down needs it: each
   * level is the same `/library/folders` path with a deeper `?path=`, so back
   * must derive the parent from this rather than from the pathname alone.
   */
  currentSearch?: Record<string, unknown>
}

/**
 * Sub-pages whose parent is not simply the section root.
 *
 * Values are lifted verbatim from what each page's own back arrow did before this
 * module existed, so behaviour is unchanged: `LicensesPage` (`backTo`),
 * `ServerEditPage`, `DuplicateCheckPage`, `PluginRegistryPage`.
 */
const EXPLICIT_PARENTS: Record<string, string> = {
  '/settings/personal-tokens': '/settings',
  '/device-cache': '/settings',
  '/settings/cache-tasks': '/settings',
  '/settings/licenses': '/settings/about',
  '/settings/servers/add': '/settings/servers',
  '/settings/duplicates': '/settings/library',
  '/settings/plugins/registry': '/settings/plugins',
  '/settings/plugins/registry/github': '/settings/plugins/registry',
  '/settings/theme-catalog': '/settings/appearance',
  '/player/lyrics/adjust': '/player',
  '/player/dlna': '/player',
  '/player/eq': '/player',
  '/player/video': '/player',
  '/demo-frame': '/',
}

/** Prefixes whose parent is the same for every child path under them. */
const EXPLICIT_PARENT_PREFIXES: Array<[prefix: string, parent: string]> = [
  ['/settings/servers/edit/', '/settings/servers'],
]

/** The 7 facet dimensions are also library view keys, so `/library?view=<field>`. */
const CATEGORY_PREFIX = '/library/category/'

/**
 * The declared parent of `pathname`, or `undefined` when it has none of its own
 * (i.e. it falls through to a section root / tab rule below).
 *
 * Split out of {@link resolveRouteBack} so the settings master–detail pane can
 * reuse *this* table instead of keeping a second one. The pane swaps sub-pages in
 * place, so it never asks "where does back navigate" — it asks "which sub-page is
 * the parent of this one", and that is the same answer. Two tables would drift the
 * moment someone adds a third-level settings page, which is exactly what
 * `AGENTS.md` §3.4 forbids.
 */
export function explicitParentOf(pathname: string): string | undefined {
  const explicit = EXPLICIT_PARENTS[pathname]
  if (explicit) return explicit

  for (const [prefix, parent] of EXPLICIT_PARENT_PREFIXES) {
    if (pathname.startsWith(prefix)) return parent
  }

  return undefined
}

export function resolveRouteBack(
  pathname: string,
  ctx: RouteBackContext,
): BackAction {
  /*
   * A tab root is where back stops being navigation and starts being "leave".
   * Checked first so a plugin tab at `/plugin/foo` prompts to exit while the same
   * page reached from the plugin manager (not a tab) goes back.
   *
   * A plugin page is only a tab ROOT when it was entered through the tab
   * (`?tab=true` → ctx.pluginTabEntry). The same pathname pushed from the grid
   * or manager has a topbar with a back arrow, and that arrow must navigate to
   * the tab the user came from — without this, a tabbed plugin's pushed page
   * swallowed the arrow entirely (exit-prompt is a back-KEY concern there).
   */
  if (ctx.navPaths.includes(pathname)) {
    const isPushedPlugin = pathname.startsWith('/plugin/') && !ctx.pluginTabEntry
    if (!isPushedPlugin) return { kind: 'exit-prompt' }
  }

  // Not authenticated: there is nothing behind login.
  if (pathname === '/login') return { kind: 'exit-prompt' }

  if (pathname.startsWith('/plugin/') && ctx.pluginManagerEntry) {
    // From the wide-screen settings pane, `/settings` restores the remembered
    // Plugin Manager pane; routing to the standalone `/settings/plugins` page
    // skipped the master list and reset the pane to Appearance.
    return { kind: 'navigate', to: ctx.pluginPaneEntry ? '/settings' : '/settings/plugins' }
  }

  if (pathname === '/player/video' && ctx.videoReturnPlugin) {
    return { kind: 'navigate', to: '/plugin/$entryPath', plugin: ctx.videoReturnPlugin }
  }

  const explicit = explicitParentOf(pathname)
  if (explicit) return { kind: 'navigate', to: explicit }

  // Drill-down into one facet dimension returns to that dimension's view, not to
  // whatever the library was showing before.
  if (pathname.startsWith(CATEGORY_PREFIX)) {
    const field = pathname.slice(CATEGORY_PREFIX.length)
    return { kind: 'navigate', to: '/library', librarySearch: { view: field } }
  }

  // Tag songs page returns to the tag view.
  if (pathname.startsWith('/library/tags/')) {
    return { kind: 'navigate', to: '/library', librarySearch: { view: 'tag' } }
  }

  // Folder browse: every drill-down level shares this pathname and differs
  // only by `?path=`. Back must step one level up (A/B/C → A/B), and only
  // leave for the folder view when already at the top. Using the shell's
  // "last content" page here would jump straight to the library root from
  // any depth, skipping every parent folder.
  if (pathname === '/library/folders') {
    const raw = typeof ctx.currentSearch?.path === 'string' ? ctx.currentSearch.path : ''
    const parts = raw.split('/').filter(Boolean)
    if (parts.length > 1) {
      return { kind: 'navigate', to: '/library/folders', search: { path: parts.slice(0, -1).join('/') } }
    }
    return { kind: 'navigate', to: '/library', librarySearch: { view: 'folder' } }
  }

  // "Add songs" resets the library to its last view, as before.
  if (pathname === '/library/add') {
    return { kind: 'navigate', to: '/library', librarySearch: ctx.lastLibrarySearch }
  }

  // Editing a playlist returns to where the edit was opened from: the detail
  // page when launched from there, or the library list when launched from the
  // row menu. The old hardcoded detail target sent list-launched edits into
  // the detail page, which is not where the user came from. Fall back to the
  // detail page when no source was recorded (cold link / notification).
  const editMatch = /^\/playlists\/(\d+)\/edit$/.exec(pathname)
  if (editMatch) {
    const src = ctx.lastContentLocation
    if (src && src.pathname && src.pathname !== pathname &&
        src.pathname !== `/playlists/${editMatch[1]}/edit` &&
        !src.pathname.startsWith('/player')) {
      const search = src.search && Object.keys(src.search).length ? src.search : undefined
      if (src.pathname === '/library') {
        const view = search?.view
        return { kind: 'navigate', to: '/library', librarySearch: typeof view === 'string' ? { view } : undefined }
      }
      return { kind: 'navigate', to: src.pathname, ...(search ? { search } : {}) }
    }
    return { kind: 'navigate', to: `/playlists/${editMatch[1]}` }
  }

  // Every remaining settings sub-page returns to the settings root — the
  // `SubPageShell` default before this module existed.
  if (pathname.startsWith('/settings/')) {
    return { kind: 'navigate', to: '/settings' }
  }

  // The full-screen player returns to the exact content page it was opened from
  // (a playlist detail, a folder browse, a category) when we know it. The shell
  // recorded that page because /player itself is chrome-less and never renders it.
  // Falling back to the tab root keeps cold starts / notification-bar entries sane.
  if (pathname === '/player') {
    return toPlayerSource(ctx)
  }

  // Playlist detail and a plugin page that is not a tab return to *the tab the
  // user thinks they are in*, which history cannot tell us — the shell records it.
  if (
    pathname.startsWith('/playlists/')
    || pathname.startsWith('/plugin/')
  ) {
    return toLastShell(ctx)
  }

  return { kind: 'fallback', to: fallbackTab(pathname, ctx.navPaths) }
}

/** Return to the recorded shell tab, restoring the library's sub-view. */
function toLastShell(ctx: RouteBackContext): BackAction {
  if (ctx.lastShellLocation === '/library') {
    return { kind: 'navigate', to: '/library', librarySearch: ctx.lastLibrarySearch }
  }
  return { kind: 'navigate', to: ctx.lastShellLocation }
}

/**
 * Where closing the full-screen player goes.
 *
 * Prefer the exact page the player was opened from — a playlist, a folder, a
 * category — so the user lands back where they actually were. That page is the
 * shell's last rendered content location, because /player renders no shell.
 *
 * Only accept a "real" content page: a tab root still goes through
 * {@link toLastShell} so the library's restored sub-view is preserved, and
 * chrome-less / auth routes are ignored as impossible sources.
 */
function toPlayerSource(ctx: RouteBackContext): BackAction {
  const src = ctx.lastContentLocation
  if (src && src.pathname && src.pathname !== '/player' && src.pathname !== '/login'
      && !src.pathname.startsWith('/player/')
      // Tab roots go through toLastShell so the library's sub-view is restored
      // via the type-checked librarySearch path (not a raw search object).
      && src.pathname !== '/' && src.pathname !== '/library') {
    const search = src.search && Object.keys(src.search).length ? src.search : undefined
    return { kind: 'navigate', to: src.pathname, ...(search ? { search } : {}) }
  }
  return toLastShell(ctx)
}

/**
 * Owning tab for an undeclared route — reuses the nav bar's ownership rule so an
 * unrecognised path lands on the tab that is lit for it (including
 * `/playlists*` → Library) instead of always dumping the user on Home.
 */
function fallbackTab(pathname: string, navPaths: readonly string[]): string {
  return activeNavPath(pathname, navPaths) ?? '/'
}
