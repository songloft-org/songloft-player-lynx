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
  /** Navigate. `librarySearch` is only meaningful when `to === '/library'`. */
  | { kind: 'navigate'; to: string; librarySearch?: LibrarySearchLike }
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

export interface RouteBackContext {
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
  /** Which tab the shell was last on, for the chrome-less pages that return to it. */
  lastShellLocation: string
  /** The library's last sub-view, so returning to it does not reset the view. */
  lastLibrarySearch: LibrarySearchLike
  /**
   * Where the song detail page was entered from, recorded by the navigation
   * helper (`navigate-to-song-detail.ts`). The song page is reachable from the
   * library, a playlist detail, a facet drill-in and the player, and back must
   * return to that origin — the library default is only for direct entry.
   */
  songDetailFrom?: string | null
  /**
   * Where the song **edit** page was entered from, same recording scheme. The
   * edit page is reachable both from the detail page and straight from a song
   * menu, and back must return to whichever it was — not always the detail
   * page.
   */
  songEditFrom?: string | null
}

/**
 * Sub-pages whose parent is not simply the section root.
 *
 * Values are lifted verbatim from what each page's own back arrow did before this
 * module existed, so behaviour is unchanged: `LicensesPage` (`backTo`),
 * `ServerEditPage`, `DuplicateCheckPage`, `PluginRegistryPage`.
 */
const EXPLICIT_PARENTS: Record<string, string> = {
  '/settings/licenses': '/settings/about',
  '/settings/servers/add': '/settings/servers',
  '/settings/duplicates': '/settings/library',
  '/settings/plugins/registry': '/settings/plugins',
  '/settings/theme-catalog': '/settings/appearance',
  '/player/lyrics/adjust': '/player',
  '/player/dlna': '/player',
  '/player/eq': '/player',
}

/** Prefixes whose parent is the same for every child path under them. */
const EXPLICIT_PARENT_PREFIXES: Array<[prefix: string, parent: string]> = [
  ['/settings/servers/edit/', '/settings/servers'],
]

/** The 7 facet dimensions are also library view keys, so `/library?view=<field>`. */
const CATEGORY_PREFIX = '/library/category/'

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

  const explicit = EXPLICIT_PARENTS[pathname]
  if (explicit) return { kind: 'navigate', to: explicit }

  for (const [prefix, parent] of EXPLICIT_PARENT_PREFIXES) {
    if (pathname.startsWith(prefix)) return { kind: 'navigate', to: parent }
  }

  // Drill-down into one facet dimension returns to that dimension's view, not to
  // whatever the library was showing before.
  if (pathname.startsWith(CATEGORY_PREFIX)) {
    const field = pathname.slice(CATEGORY_PREFIX.length)
    return { kind: 'navigate', to: '/library', librarySearch: { view: field } }
  }

  /*
   * Song edit returns to the page it was opened from — a playlist detail when
   * the song menu's "edit" was tapped there, the song detail page when the edit
   * button was tapped there. Nothing recorded (direct URL entry) falls back to
   * the detail page, the natural parent. Must be matched before the song-detail
   * prefix rule below, which the edit path also starts with.
   */
  const songEditMatch = /^\/library\/song\/(\d+)\/edit$/.exec(pathname)
  if (songEditMatch) {
    const from = ctx.songEditFrom
    if (from && from !== pathname) {
      // Same library-subview restoration as the detail rule below.
      if (from === '/library') {
        return { kind: 'navigate', to: '/library', librarySearch: ctx.lastLibrarySearch }
      }
      return { kind: 'navigate', to: from }
    }
    return { kind: 'navigate', to: `/library/song/${songEditMatch[1]}` }
  }

  // Song detail returns to the page it was opened from (playlist detail, facet
  // drill-in, the player…), which only the recorded origin can name — the
  // history stack cannot (every navigation is a push). Falls back to the
  // library when nothing was recorded (e.g. direct URL entry).
  //
  // "Add songs" resets the library to its last view, as before.
  if (pathname.startsWith('/library/song/')) {
    const from = ctx.songDetailFrom
    if (from && from !== pathname) return { kind: 'navigate', to: from }
    return { kind: 'navigate', to: '/library', librarySearch: ctx.lastLibrarySearch }
  }
  if (pathname === '/library/add') {
    return { kind: 'navigate', to: '/library', librarySearch: ctx.lastLibrarySearch }
  }

  // Editing a playlist returns to that playlist's detail page — NOT to the shell
  // tab like every other `/playlists/…` path below. Must be matched before the
  // prefix rule, or the edit form's back arrow would kick the user out of the
  // playlist entirely.
  const editMatch = /^\/playlists\/(\d+)\/edit$/.exec(pathname)
  if (editMatch) {
    return { kind: 'navigate', to: `/playlists/${editMatch[1]}` }
  }

  // Every remaining settings sub-page returns to the settings root — the
  // `SubPageShell` default before this module existed.
  if (pathname.startsWith('/settings/')) {
    return { kind: 'navigate', to: '/settings' }
  }

  // Chrome-less full player, playlist detail, and a plugin page that is not a tab
  // all return to *the tab the user thinks they are in*, which history cannot
  // tell us — the shell records it instead.
  if (
    pathname === '/player'
    || pathname.startsWith('/playlists/')
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
 * Owning tab for an undeclared route — reuses the nav bar's ownership rule so an
 * unrecognised path lands on the tab that is lit for it (including
 * `/playlists*` → Library) instead of always dumping the user on Home.
 */
function fallbackTab(pathname: string, navPaths: readonly string[]): string {
  return activeNavPath(pathname, navPaths) ?? '/'
}
