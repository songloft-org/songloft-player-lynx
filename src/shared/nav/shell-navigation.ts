/**
 * Navigation-shell policy: which tab the full-screen player returns to, and which
 * routes show the mini player.
 *
 * Both fix reported device bugs. The player's close button used to be hardcoded to
 * `/` so it always dumped you on Home, and the mini player's only condition was
 * "is a song loaded", so it sat at the foot of Settings and plugin pages too.
 */
import { NAV_DESTINATIONS } from './destinations.js'

/**
 * Shell tabs the full-screen player can return to.
 *
 * Only tab roots are recorded. Detail routes (`/playlists/5`) deliberately leave
 * the value alone, so closing the player after playing something from a playlist
 * you opened out of the library returns you to the library — the tab you think of
 * yourself as being in. It also keeps this type a closed set of literals, which
 * keeps the `navigate()` calls type-checked.
 */
const RETURNABLE_PATHS = ['/', '/library'] as const

export type ShellReturnPath = (typeof RETURNABLE_PATHS)[number]

/**
 * Session-only, module-level — the same shape as `last-library-search`, which
 * solves the sibling "remember where I was" problem for the library's sub-tab.
 * Not persisted: after a cold start Home is the right place to land anyway.
 */
let lastShellLocation: ShellReturnPath = '/'

export function getLastShellLocation(): ShellReturnPath {
  return lastShellLocation
}

/** Records `pathname` if it is a returnable tab root; ignores anything else. */
export function setLastShellLocation(pathname: string): void {
  const match = RETURNABLE_PATHS.find((p) => p === pathname)
  if (match) lastShellLocation = match
}

/**
 * The last *content* page the shell actually rendered, including detail routes
 * and their search params (e.g. `/playlists/7`, `/library/folders?path=/music/ rock`).
 *
 * This is separate from {@link lastShellLocation} on purpose. Chrome-less pages
 * such as `/player` do not render the shell, so the shell's last rendered page is
 * exactly where the user came from before opening the full-screen player. Routing
 * the player's back/close there — instead of to a tab root — preserves the place
 * they were actually in (a playlist, a folder), which is what users expect.
 *
 * Session-only and module-level, like `lastShellLocation`: a cold start has no
 * meaningful "previous page", so the player falls back to the tab root instead.
 */
export interface ContentLocation {
  pathname: string
  search: Record<string, unknown>
}

let lastContentLocation: ContentLocation | null = null

export function getLastContentLocation(): ContentLocation | null {
  return lastContentLocation
}

export function setLastContentLocation(location: ContentLocation): void {
  lastContentLocation = location
}

/**
 * The nav destinations currently rendered — the built-ins plus one per enabled
 * plugin tab. Written by `ShellLayout` during render, the same way
 * {@link setLastShellLocation} is, because the shell re-renders on every
 * navigation and on every plugin-tab config change.
 *
 * Exists so non-React callers can answer "is this pathname a tab root?" — which
 * is what decides whether the back key navigates or offers to exit the app. The
 * list cannot be a constant: plugin tabs come from the backend.
 *
 * Seeded with the built-ins so a chrome-less route (`/player`, `/login`) that
 * renders before the shell ever mounted still gets a sane answer.
 */
let navPaths: readonly string[] = NAV_DESTINATIONS.map((d) => d.path)

export function getNavPaths(): readonly string[] {
  return navPaths
}

export function setNavPaths(paths: readonly string[]): void {
  navPaths = paths
}

/**
 * Shell width store — kept so drill-in pages (AddSongs, CreatePlaylist, …)
 * can read the shell's measured width synchronously instead of running their
 * own async `measureWidth` (which fires after paint and causes a flash).
 *
 * Written by `ShellLayout` on every render; read by `useSyncExternalStore`.
 */
let shellWidth = 0
const shellWidthListeners = new Set<() => void>()

export function getShellWidth(): number {
  return shellWidth
}

export function setShellWidth(w: number): void {
  if (!Number.isFinite(w) || w <= 0 || shellWidth === w) return
  shellWidth = w
  for (const l of shellWidthListeners) l()
}

export function subscribeShellWidth(listener: () => void): () => void {
  shellWidthListeners.add(listener)
  return () => { shellWidthListeners.delete(listener) }
}

/**
 * Whether the mini player belongs on `pathname` — content browsing only.
 *
 * Settings, plugin, and the settings sub-pages are excluded by omission rather
 * than by a deny-list, so a newly added settings route cannot accidentally inherit
 * the mini player. `/library/...` (category drill-down) and `/playlists/...`
 * (playlist detail) are included: they are where you pick songs from.
 */
export function showsMiniPlayer(pathname: string): boolean {
  return pathname === '/'
    || pathname === '/library'
    || pathname.startsWith('/library/')
    || pathname.startsWith('/playlists/')
}

/**
 * Whether the nav destination `navPath` owns `pathname` — i.e. whether its tab
 * should be lit while that route is showing.
 *
 * The shell used to compare `pathname === dest.path`, so **every sub-page left the
 * whole nav bar dark**: opening Settings → Plugins, or drilling into a library
 * category, lit nothing at all. The Flutter reference
 * (`shell_layout.dart:_getCurrentIndex`) has always matched by prefix, and this
 * mirrors it, including its two judgement calls:
 *
 * - `/playlists*` belongs to **Library**, not Home («歌单已并入曲库» in the
 *   reference), even though a playlist can be opened from Home. Which tab you
 *   *return* to is a separate question, and {@link getLastShellLocation} already
 *   answers it from history rather than from the path.
 * - Home owns nothing by prefix — `/` is a prefix of everything. It is the
 *   fallback in {@link activeNavPath} instead, so an unrecognised route still
 *   lights one tab rather than none.
 */
export function navPathOwns(navPath: string, pathname: string): boolean {
  if (pathname === navPath) return true
  if (navPath === '/') return false
  if (pathname.startsWith(`${navPath}/`)) return true
  if (navPath === '/library') {
    return pathname === '/playlists' || pathname.startsWith('/playlists/')
  }
  return false
}

/**
 * Which of the currently rendered `navPaths` should be lit for `pathname`.
 *
 * `navPaths` is the live list — the three built-in destinations plus one per
 * enabled plugin tab — because a plugin tab's path is only known at runtime.
 * Longest match wins, so `/plugin/miot` is not shadowed by a shorter sibling.
 */
export function activeNavPath(
  pathname: string,
  navPaths: readonly string[],
): string | undefined {
  const byLength = [...navPaths].sort((a, b) => b.length - a.length)
  return byLength.find((p) => navPathOwns(p, pathname)) ?? navPaths.find((p) => p === '/')
}
