/**
 * Shell navigation destinations.
 *
 * Mirrors the intent of the Flutter app's
 * `songloft-player/lib/shared/layouts/active_destinations.dart`: Home is always
 * present, followed by Library (when enabled), one entry per enabled plugin
 * tab, and Settings last. `path` values map directly to the TanStack Router
 * routes mounted under the shell.
 */
import type { PluginTabEntry } from '../../features/jsplugin/data/tab-config.js'
import type { IconName } from '../ui/icons.js'

export interface NavDestination {
  path: string
  /** i18n key for the nav label (localised in the shell via `t(...)`). */
  labelKey: string
  icon: IconName
  /**
   * The plugin tab this destination was built from, when it is one. Plugin tabs
   * render the plugin's literal (non-i18n) name and their own icon, so
   * `labelKey` and `icon` are placeholders for them.
   */
  plugin?: PluginTabEntry
}

const HOME: NavDestination = { path: '/', labelKey: 'nav.home', icon: 'home' }
const LIBRARY: NavDestination = { path: '/library', labelKey: 'nav.library', icon: 'library' }
const SETTINGS: NavDestination = { path: '/settings', labelKey: 'nav.settings', icon: 'settings' }

export const NAV_DESTINATIONS: NavDestination[] = [HOME, LIBRARY, SETTINGS]

/**
 * Narrow-layout collapse thresholds, mirroring the Flutter
 * `adaptive_scaffold.dart` constants (`_mobileMaxVisible` / `_mobileRealSlots`):
 * at most five destinations fit the bottom bar. When there are more, the bar
 * keeps the first {@link NAV_REAL_SLOTS} and the fifth slot becomes a "More"
 * button opening a sheet with the rest. Wide rails never fold.
 */
export const NAV_MAX_VISIBLE = 5
export const NAV_REAL_SLOTS = 4

/**
 * The live destination list: Home, Library when `showLibrary`, one per enabled
 * plugin tab, then Settings last — the Flutter `ActiveDestinations.compute`
 * order. Settings stays the tail anchor, so the overflow slice (everything past
 * {@link NAV_REAL_SLOTS}) is always plugin tabs plus, once they run out,
 * Settings.
 */
export function buildNavDestinations(
  showLibrary: boolean,
  pluginTabs: readonly PluginTabEntry[],
): NavDestination[] {
  const destinations: NavDestination[] = [HOME]
  if (showLibrary) destinations.push(LIBRARY)
  for (const tab of pluginTabs) {
    destinations.push({
      path: `/plugin/${tab.entryPath}`,
      labelKey: '',
      icon: 'settings',
      plugin: tab,
    })
  }
  destinations.push(SETTINGS)
  return destinations
}
