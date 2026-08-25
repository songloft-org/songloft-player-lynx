import { useState } from '@lynx-js/react'
import { Outlet, useNavigate, useRouterState } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

// Import MiniPlayer directly (not the player feature barrel) so the shell graph
// does not eagerly pull in the full player + its lynx-ui gesture leaves.
import { MiniPlayer } from '../../features/player/widgets/MiniPlayer.js'
import { PluginTabIcon, useShellNavTabs } from '../../features/jsplugin/index.js'
import { getLastLibrarySearch } from '../../features/library/index.js'
import {
  buildNavDestinations,
  NAV_MAX_VISIBLE,
  NAV_REAL_SLOTS,
  type NavDestination,
} from '../nav/destinations.js'
import { MoreTabsSheet } from '../nav/MoreTabsSheet.js'
import { activeNavPath, setLastShellLocation, setNavPaths, setShellWidth, showsMiniPlayer } from '../nav/shell-navigation.js'
import { useBreakpoint } from '../responsive/useBreakpoint.js'
import { Icon, ICON_COLORS } from '../ui/Icon.js'
import './ShellLayout.css'

/**
 * Adaptive navigation shell.
 *
 * - Measures its own width via `bindlayoutchange` to pick a breakpoint.
 * - Narrow (mobile) -> bottom navigation bar, folding past
 *   {@link NAV_MAX_VISIBLE} tabs into a "More" sheet (the Flutter
 *   `adaptive_scaffold.dart` overflow behaviour).
 * - Wide (tablet/desktop/tv) -> side navigation rail, every tab visible.
 * - Renders the active child route through `<Outlet />`.
 */
export function ShellLayout() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { width, breakpoint, isWide, onLayoutChange } = useBreakpoint(0, '.shell')
  const pathname = useRouterState({ select: s => s.location.pathname })
  const shellTabs = useShellNavTabs()
  // Until the config query lands, the built-ins render (Flutter's
  // `TabConfig.defaultConfig()` fallback): all three, no plugins.
  const destinations = buildNavDestinations(
    shellTabs.data?.showLibrary ?? true,
    shellTabs.data?.pluginTabs ?? [],
  )
  const [showMoreTabs, setShowMoreTabs] = useState(false)

  // The live destination list: built-ins plus one per enabled plugin tab. Two
  // consumers — the lit-tab calculation below, and the back key, which needs to
  // know whether the current path is a tab root (there, back offers to exit
  // rather than navigating). The FULL list, not the folded one: a plugin tab
  // hidden behind "More" is still a tab root to the back key.
  const navPaths = destinations.map(d => d.path)

  // Written during render, matching how `LibraryPage` records its search — the
  // shell re-renders on every navigation, so there is nothing an effect would add.
  setLastShellLocation(pathname)
  setNavPaths(navPaths)
  setShellWidth(width)

  // Which tab is lit. Matched by ownership, not equality — otherwise every
  // sub-page (Settings → Plugins, a library category, a playlist) leaves the
  // whole bar dark. See `navPathOwns`.
  const litPath = activeNavPath(pathname, navPaths)

  const go = (dest: NavDestination) => {
    if (dest.plugin) {
      navigate({ to: '/plugin/$entryPath', params: { entryPath: dest.plugin.entryPath } })
    } else if (dest.path === '/library') {
      navigate({ to: '/library', search: getLastLibrarySearch() })
    } else {
      navigate({ to: dest.path as '/' })
    }
  }

  const renderTab = (dest: NavDestination, active: boolean) => (
    <view
      key={dest.path}
      className={active ? 'nav-item nav-item--active' : 'nav-item'}
      bindtap={() => go(dest)}
      data-testid={`nav-item-${dest.plugin?.entryPath ?? (dest.path === '/' ? 'home' : dest.path.slice(1))}`}
    >
      <view className='nav-item__icon'>
        {dest.plugin
          ? <PluginTabIcon tab={dest.plugin} active={active} />
          : (
            <Icon
              name={dest.icon}
              size={24}
              color={active ? ICON_COLORS.primaryContent : ICON_COLORS.contentMuted}
            />
          )}
      </view>
      <text className='nav-item__label'>
        {dest.plugin ? dest.plugin.name : t(dest.labelKey)}
      </text>
    </view>
  )

  /** Wide rail: every destination, in a scrollable column (Flutter desktop rail). */
  const renderRailItems = () => destinations.map(dest => renderTab(dest, litPath === dest.path))

  /**
   * Narrow bottom bar: the first {@link NAV_REAL_SLOTS} destinations, plus a
   * "More" slot when the list overflows {@link NAV_MAX_VISIBLE}. The More slot
   * carries the selected look while the lit tab is one of the overflowed ones —
   * the Flutter `barSelectedIndex = _mobileRealSlots` behaviour.
   */
  const renderBottomBarItems = () => {
    const folding = destinations.length > NAV_MAX_VISIBLE
    const visible = folding ? destinations.slice(0, NAV_REAL_SLOTS) : destinations
    const items = visible.map(dest => renderTab(dest, litPath === dest.path))
    if (!folding) return items
    const moreActive = litPath != null && !visible.some(dest => dest.path === litPath)
    items.push(
      <view
        key='more-tabs'
        className={moreActive ? 'nav-item nav-item--active' : 'nav-item'}
        bindtap={() => setShowMoreTabs(true)}
        data-testid='nav-item-more'
      >
        <view className='nav-item__icon'>
          <Icon
            name='more'
            size={24}
            color={moreActive ? ICON_COLORS.primaryContent : ICON_COLORS.contentMuted}
          />
        </view>
        <text className='nav-item__label'>{t('nav.more')}</text>
      </view>,
    )
    return items
  }

  return (
    <view
      className={isWide ? 'shell shell--wide' : 'shell shell--narrow'}
      data-testid='shell-root'
      bindlayoutchange={onLayoutChange}
      data-breakpoint={breakpoint}
    >
      {isWide
        ? (
          <view className='shell__rail'>
            <view className='shell__brand'>
              <image
                className='shell__brand-icon'
                src='/app_icon.png'
                mode='aspectFit'
              />
              <text className='shell__brand-text'>Songloft</text>
            </view>
            <scroll-view className='shell__rail-scroll' scroll-y>
              {renderRailItems()}
            </scroll-view>
          </view>
        )
        : null}

      <view className='shell__content'>
        <view className='shell__body'>
          <Outlet />
        </view>

        {/* Mini-player sits above the bottom bar (narrow) / at the foot of the
            content column (wide). Renders only when a song is loaded AND the route
            is a content-browsing one — the visibility rule lives here rather than
            inside MiniPlayer so the widget stays unaware of routing. */}
        {showsMiniPlayer(pathname) ? <MiniPlayer /> : null}

        {isWide
          ? null
          : <view className='shell__bottombar'>{renderBottomBarItems()}</view>}
      </view>

      {/* The "More" overflow sheet, mounted beside the bottom bar whose fifth
          slot opens it — not on the root route, because its trigger and its
          lifecycle both live here (logout unmounts the shell and closes the
          sheet with it). Renders only on narrow layouts: the wide rail never
          folds, so it has no overflow to show. */}
      {isWide
        ? null
        : (
          <MoreTabsSheet
            items={destinations.slice(NAV_REAL_SLOTS)}
            activePath={litPath}
            show={showMoreTabs}
            onShowChange={setShowMoreTabs}
          />
        )}
    </view>
  )
}
