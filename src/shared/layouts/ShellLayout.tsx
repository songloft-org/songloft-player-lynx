import { useSyncExternalStore, useState } from '@lynx-js/react'
import { Outlet, useNavigate, useRouterState } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

// Import MiniPlayer directly (not the player feature barrel) so the shell graph
// does not eagerly pull in the full player + its lynx-ui gesture leaves.
import { MiniPlayer } from '../../features/player/widgets/MiniPlayer.js'
// The store behind MiniPlayer — already in the shell graph via the widget
// itself, so this import adds no new leaves. Read here only for the
// `shell--with-mini` class (the pages' `--nav-inset` tier), never for render
// output.
import { usePlayerStore } from '../../features/player/store/index.js'
import { PluginTabIcon, useShellNavTabs } from '../../features/jsplugin/index.js'
import { getLastLibrarySearch } from '../../features/library/index.js'
import {
  buildNavDestinations,
  NAV_MAX_VISIBLE,
  NAV_REAL_SLOTS,
  type NavDestination,
} from '../nav/destinations.js'
import { MoreTabsSheet } from '../nav/MoreTabsSheet.js'
import { activeNavPath, getShellWidth, setLastShellLocation, setNavPaths, setShellWidth, showsMiniPlayer, subscribeShellWidth } from '../nav/shell-navigation.js'
import { useBreakpoint } from '../responsive/useBreakpoint.js'
import { BackdropBlur } from '../ui/BackdropBlur.js'
import { Icon, activeAccentIconColor, ICON_COLORS } from '../ui/Icon.js'
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
  // Seed the breakpoint from the shell-width cache so a remount (returning
  // from the chrome-less `/player` route, which sits outside `shellRoute` and
  // unmounts this layout) paints the correct layout on frame 1. Without the
  // seed, `useBreakpoint(0, ...)` starts at width 0 → `mobile` → the first
  // frame paints a narrow bottom bar, and only after the async
  // `boundingClientRect` measurement lands does it switch to the wide side
  // rail — the "left sidebar appears late" flash (songloft-player-lynx#6).
  // The cache is module-level, survives the shell's unmount while the player
  // is open, and is published by this same render on every width change.
  // Same pattern as `LibraryLayout` (see its anti-flash comment). Cold start:
  // cache is 0 → behaves exactly as before (narrow first frame).
  const cachedWidth = useSyncExternalStore(subscribeShellWidth, getShellWidth)
  const { width, breakpoint, isWide, onLayoutChange } = useBreakpoint(cachedWidth, '.shell')
  const pathname = useRouterState({ select: s => s.location.pathname })
  const shellTabs = useShellNavTabs()
  // Song presence for the mini-player inset tier — same condition MiniPlayer
  // itself renders under (`showsMiniPlayer(pathname)` + a loaded song), kept
  // in sync here so the class and the widget never disagree.
  const hasSong = usePlayerStore((s) => s.currentSong != null)
  // Until the config query lands, the built-ins render (Flutter's
  // `TabConfig.defaultConfig()` fallback): all three, no plugins.
  const destinations = buildNavDestinations(
    shellTabs.data?.showLibrary ?? true,
    shellTabs.data?.pluginTabs ?? [],
  )
  const [showMoreTabs, setShowMoreTabs] = useState(false)
  // The `shell--with-mini` class: while the floating mini-player is up, the
  // pages' `--nav-inset` grows to clear it (see ShellLayout.css) — without
  // this, list tails scroll to a stop half-hidden behind the player.
  const withMini = showsMiniPlayer(pathname) && hasSong

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
      // `tab: true` — the plugin opens chromeless (no topbar), like Flutter's
      // plugin_tab_page; see the route's validateSearch in router.tsx.
      navigate({ to: '/plugin/$entryPath', params: { entryPath: dest.plugin.entryPath }, search: { tab: true } })
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
      {/* The tint pill: glyph + label wrapped together, so the active item's
          faint accent capsule (`--primary-faint`) covers both — the iOS-26
          selection style shared by the bottom bar and the wide rail. */}
      <view className='nav-item__pill'>
        <view className='nav-item__icon'>
          {dest.plugin
            ? <PluginTabIcon tab={dest.plugin} active={active} />
            : (
              <Icon
                name={dest.icon}
                size={24}
                color={active ? activeAccentIconColor() : ICON_COLORS.contentMuted}
              />
            )}
        </view>
        <text className='nav-item__label'>
          {dest.plugin ? dest.plugin.name : t(dest.labelKey)}
        </text>
      </view>
    </view>
  )

  /**
   * Wide rail: every destination in iPadOS-style sections — main items first,
   * plugin tabs under a "插件" header (omitted when there are none), Settings
   * anchored at the foot group. Same destination order as the narrow bar
   * (home → library → plugins → settings), only visually grouped.
   */
  const renderRailItems = () => {
    const main = destinations.filter(d => !d.plugin && d.path !== '/settings')
    const plugins = destinations.filter(d => d.plugin)
    const settings = destinations.filter(d => d.path === '/settings')

    const items = main.map(dest => renderTab(dest, litPath === dest.path))
    if (plugins.length > 0) {
      items.push(
        <text
          key='rail-plugins-header'
          className='shell__rail-group-header'
          data-testid='rail-plugins-header'
        >
          {t('nav.plugins')}
        </text>,
      )
      items.push(...plugins.map(dest => renderTab(dest, litPath === dest.path)))
    }
    if (settings.length > 0) {
      // The gap separates the plugin group from the foot group — with no
      // plugins, Settings just follows the main items directly.
      if (plugins.length > 0) {
        items.push(<view key='rail-settings-gap' className='shell__rail-gap' data-testid='rail-settings-gap' />)
      }
      items.push(...settings.map(dest => renderTab(dest, litPath === dest.path)))
    }
    return items
  }

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
        <view className='nav-item__pill'>
          <view className='nav-item__icon'>
            <Icon
              name='more'
              size={24}
              color={moreActive ? activeAccentIconColor() : ICON_COLORS.contentMuted}
            />
          </view>
          <text className='nav-item__label'>{t('nav.more')}</text>
        </view>
      </view>,
    )
    return items
  }

  return (
    <view
      className={isWide
        ? 'shell shell--wide'
        : `shell shell--narrow${withMini ? ' shell--with-mini' : ''}`}
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
          : (
            <view className='shell__bottombar'>
              {/* Panel-mode blur, so the capsule is a real material over the
                  scrolling content rather than an 0.85 wash. Apple's tab bar is
                  the reference here. See `BackdropBlur.tsx`. */}
              <BackdropBlur className='ui-backdrop-blur--pill' />
              {renderBottomBarItems()}
            </view>
          )}
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
