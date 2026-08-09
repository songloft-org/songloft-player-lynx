/**
 * Shell navigation destinations.
 *
 * Mirrors the intent of the Flutter app's
 * `songloft-player/lib/shared/layouts/active_destinations.dart`: Home is always
 * present, followed by Library and Settings. `path` values map directly to the
 * TanStack Router routes mounted under the shell.
 */
import type { IconName } from '../ui/icons.js'

export interface NavDestination {
  path: string
  label: string
  icon: IconName
}

export const NAV_DESTINATIONS: NavDestination[] = [
  { path: '/', label: 'Home', icon: 'home' },
  { path: '/library', label: 'Library', icon: 'library' },
  { path: '/settings', label: 'Settings', icon: 'settings' },
]
