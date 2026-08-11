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
