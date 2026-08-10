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
  /** i18n key for the nav label (localised in the shell via `t(...)`). */
  labelKey: string
  icon: IconName
}

export const NAV_DESTINATIONS: NavDestination[] = [
  { path: '/', labelKey: 'nav.home', icon: 'home' },
  { path: '/library', labelKey: 'nav.library', icon: 'library' },
  { path: '/settings', labelKey: 'nav.settings', icon: 'settings' },
]
