import { useEffect, useSyncExternalStore, useState } from '@lynx-js/react'
import { Outlet, useNavigate, useRouterState } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { hostAssetUrl } from '../../core/config/app-config.js'

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
import { getIsScrolled, subscribeIsScrolled } from '../nav/scroll-visibility.js'
import { getRailCollapsed, subscribeRailCollapsed, toggleRailCollapsed } from './rail-collapse.js'
import { useBreakpoint } from '../responsive/useBreakpoint.js'
import { BackdropBlur } from '../ui/BackdropBlur.js'
import { useCapsuleMaterialStyle } from '../ui/capsule-material.js'
import { Icon, activeAccentIconColor, ICON_COLORS } from '../ui/Icon.js'
import '../ui/glass-sheen-motion.css'
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
  const capsuleMaterialStyle = useCapsuleMaterialStyle()
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
  // Scroll-edge signal: a page scrolled past its top deepens the floating
  // capsule's shadow (see `.shell--scrolled` in `ShellLayout.css`). Lives in a
  // cross-layer store because the scroller is in the page the shell renders via
  // `<Outlet />`, not a child the shell can reach through props.
  const scrolled = useSyncExternalStore(subscribeIsScrolled, getIsScrolled)
  // Rail collapse (wide only). Subscribed rather than lifted into this
  // component's state because the shell unmounts on `/player` and remounts on
  // close — the module-level store is what survives that round-trip with the
  // same anti-flash reasoning as `cachedWidth` above.
  const railCollapsed = useSyncExternalStore(subscribeRailCollapsed, getRailCollapsed)
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
  useEffect(() => {
    const g = globalThis as Record<string, unknown>
    const prev = g.__E2E_SHELL__ as Record<string, unknown> | undefined
    const obj = prev ?? {}
    obj.setShowMoreTabs = setShowMoreTabs
    g.__E2E_SHELL__ = obj
    return () => { delete obj.setShowMoreTabs }
  }, [])
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

  // Bottom-bar indicator geometry (narrow only). Computed once here so both
  // the indicator and renderBottomBarItems share the same folding decision.
  const isNavFolding = destinations.length > NAV_MAX_VISIBLE
  const navVisibleDests = isNavFolding ? destinations.slice(0, NAV_REAL_SLOTS) : destinations
  const indicatorSlotCount = isNavFolding ? NAV_REAL_SLOTS + 1 : destinations.length
  const indicatorSlotIndex = (() => {
    if (litPath == null) return 0
    const idx = navVisibleDests.findIndex(d => d.path === litPath)
    return idx !== -1 ? idx : isNavFolding ? NAV_REAL_SLOTS : 0
  })()

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
                // Pinned: the bar's capsule is a fixed `--nav-pill-height`, and a
                // plugin tab's glyph is a CSS-sized `<image>`/`<svg>`
                // (`--nav-icon-size`) that the font scale cannot reach — scaling
                // only the built-in glyphs would put two sizes in one bar.
                scale={false}
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
   * Wide rail: one flat list of destinations, in the same order as the narrow
   * bar (home → library → plugins → settings).
   *
   * There used to be a "插件" group header between the built-ins and the plugin
   * tabs, with a spacer before Settings. Both are gone (user call, 2026-10-01):
   * a header that names a group which is already visually obvious (the plugin
   * tabs are the ones carrying plugin icons) earned its space in neither state,
   * and it was the element that wrapped into 插/件 on the collapsed rail. The
   * rail is now a single icon column whose spacing comes from the rows alone.
   */
  const renderRailItems = () =>
    destinations.map(dest => renderTab(dest, litPath === dest.path))

  /**
   * Narrow bottom bar: the first {@link NAV_REAL_SLOTS} destinations, plus a
   * "More" slot when the list overflows {@link NAV_MAX_VISIBLE}. The More slot
   * carries the selected look while the lit tab is one of the overflowed ones —
   * the Flutter `barSelectedIndex = _mobileRealSlots` behaviour.
   */
  const renderBottomBarItems = () => {
    const items = navVisibleDests.map(dest => renderTab(dest, litPath === dest.path))
    if (!isNavFolding) return items
    const moreActive = litPath != null && !navVisibleDests.some(dest => dest.path === litPath)
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
              // Pinned for the same reason as the destinations above.
              scale={false}
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
        ? `shell shell--wide${railCollapsed ? ' shell--rail-collapsed' : ''}`
        : `shell shell--narrow${withMini ? ' shell--with-mini' : ''}${scrolled ? ' shell--scrolled' : ''}`}
      data-testid='shell-root'
      bindlayoutchange={onLayoutChange}
      data-breakpoint={breakpoint}
    >
      {isWide
        ? (
          <view className='shell__rail'>
            {/* Fixed-geometry column. The rail's own width animates and only its
                clip edge moves, so every row keeps its expanded position and
                nothing re-lays-out mid-transition (the Flutter client's fix for
                the same jitter — see ShellLayout.css). */}
            <view className='shell__rail-inner'>
              <view className='shell__brand'>
                {/* The brand mark keeps the nav glyphs' column, so the logo is
                    centred on the same axis as every icon below it. */}
                <view className='shell__brand-mark'>
                  <image
                    className='shell__brand-icon'
                    src={hostAssetUrl('app_icon.png')}
                    mode='aspectFit'
                  />
                </view>
                <text className='shell__brand-text'>Songloft</text>
              </view>
              <scroll-view className='shell__rail-scroll' scroll-y>
                {renderRailItems()}
              </scroll-view>
              {/* Rail foot: the collapse toggle. Reuses the destination row's
                  classes, so it inherits the row metrics — and, when collapsed,
                  the same shrinking pill and faded label. The visible label is
                  always the 收起 wording: in the collapsed state it is clipped
                  away anyway, and swapping the wording at the moment the fade
                  starts would flash a different string mid-transition (the
                  accessibility name does follow the state). */}
              <view className='shell__rail-foot'>
                <view
                  className='nav-item'
                  bindtap={() => toggleRailCollapsed()}
                  data-testid='rail-collapse-toggle'
                  accessibility-element={true}
                  accessibility-label={t(railCollapsed ? 'nav.expandSidebar' : 'nav.collapseSidebar')}
                >
                  <view className='nav-item__pill'>
                    <view className='nav-item__icon'>
                      <Icon
                        name='sidebar'
                        size={24}
                        color={ICON_COLORS.contentMuted}
                        // Pinned like every other rail glyph: a plugin tab's icon
                        // is CSS-sized and cannot follow the font scale.
                        scale={false}
                      />
                    </view>
                    <text className='nav-item__label'>
                      {t('nav.collapseSidebar')}
                    </text>
                  </view>
                </view>
              </view>
            </view>
          </view>
        )
        : null}

      <view className='shell__content'>
        <view className='shell__body' id='songloft-backdrop' flatten={false}>
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
              <view className='ui-capsule-material glass-sheen-breathe' style={capsuleMaterialStyle} flatten={false} accessibility-element={false} />
              {/* Flow indicator — single sliding capsule behind the active tab.
                  DOM-ordered before the nav items so it renders behind them. */}
              <view
                className='nav-indicator'
                style={{
                  width: `calc(100% / ${indicatorSlotCount})`,
                  transform: `translateX(${indicatorSlotIndex * 100}%)`,
                }}
              >
                <view className='nav-indicator__pill' />
              </view>
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
