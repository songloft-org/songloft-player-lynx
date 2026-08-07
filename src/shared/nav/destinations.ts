/**
 * Shell navigation destinations.
 *
 * Mirrors the intent of the Flutter app's
 * `songloft-player/lib/shared/layouts/active_destinations.dart`: Home is always
 * present, followed by Library and Settings. `path` values map directly to the
 * TanStack Router routes mounted under the shell.
 */
export interface NavDestination {
  path: string
  label: string
  icon: string
}

export const NAV_DESTINATIONS: NavDestination[] = [
  { path: '/', label: 'Home', icon: '⌂' },
  { path: '/library', label: 'Library', icon: '♪' },
  { path: '/settings', label: 'Settings', icon: '⚙' },
]
