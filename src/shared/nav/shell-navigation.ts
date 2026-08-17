/**
 * Navigation-shell policy: which tab the full-screen player returns to, and which
 * routes show the mini player.
 *
 * Both fix reported device bugs. The player's close button used to be hardcoded to
 * `/` so it always dumped you on Home, and the mini player's only condition was
 * "is a song loaded", so it sat at the foot of Settings and plugin pages too.
 */

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
