import { Outlet, useNavigate, useRouterState } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

// Import MiniPlayer directly (not the player feature barrel) so the shell graph
// does not eagerly pull in the full player + its lynx-ui gesture leaves.
import { MiniPlayer } from '../../features/player/widgets/MiniPlayer.js'
import { usePluginTabs } from '../../features/jsplugin/index.js'
import { getLastLibrarySearch } from '../../features/library/index.js'
import { NAV_DESTINATIONS } from '../nav/destinations.js'
import { setLastShellLocation, showsMiniPlayer } from '../nav/shell-navigation.js'
import { useBreakpoint } from '../responsive/useBreakpoint.js'
import { Icon, ICON_COLORS } from '../ui/Icon.js'
import './ShellLayout.css'

/**
 * Adaptive navigation shell.
 *
 * - Measures its own width via `bindlayoutchange` to pick a breakpoint.
 * - Narrow (mobile) -> bottom navigation bar.
 * - Wide (tablet/desktop/tv) -> side navigation rail.
 * - Renders the active child route through `<Outlet />`.
 */
export function ShellLayout() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { breakpoint, isWide, onLayoutChange } = useBreakpoint()
  const pathname = useRouterState({ select: s => s.location.pathname })
  const pluginTabsQuery = usePluginTabs()
  const pluginTabs = pluginTabsQuery.data ?? []

  // Written during render, matching how `LibraryPage` records its search — the
  // shell re-renders on every navigation, so there is nothing an effect would add.
  setLastShellLocation(pathname)

  const renderNavItems = () => {
    const items = NAV_DESTINATIONS.map(dest => {
      const active = pathname === dest.path
      return (
        <view
          key={dest.path}
          className={active ? 'nav-item nav-item--active' : 'nav-item'}
          bindtap={() => {
            if (dest.path === '/library') {
              navigate({ to: '/library', search: getLastLibrarySearch() })
            } else {
              navigate({ to: dest.path })
            }
          }}
        >
          <view className='nav-item__icon'>
            <Icon
              name={dest.icon}
              size={24}
              color={active ? ICON_COLORS.primary : ICON_COLORS.contentMuted}
            />
          </view>
          <text className='nav-item__label'>{t(dest.labelKey)}</text>
        </view>
      )
    })

    for (const tab of pluginTabs) {
      const pluginPath = `/plugin/${tab.entryPath}`
      const active = pathname === pluginPath
      items.push(
        <view
          key={pluginPath}
          className={active ? 'nav-item nav-item--active' : 'nav-item'}
          bindtap={() => navigate({ to: '/plugin/$entryPath', params: { entryPath: tab.entryPath } })}
        >
          <view className='nav-item__icon'>
            <Icon
              name='settings'
              size={24}
              color={active ? ICON_COLORS.primary : ICON_COLORS.contentMuted}
            />
          </view>
          <text className='nav-item__label'>{tab.name}</text>
        </view>,
      )
    }

    return items
  }

  return (
    <view
      className={isWide ? 'shell shell--wide' : 'shell shell--narrow'}
      bindlayoutchange={onLayoutChange}
      data-breakpoint={breakpoint}
    >
      {isWide
        ? (
          <view className='shell__rail'>
            <text className='shell__brand'>Songloft</text>
            {renderNavItems()}
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
          : <view className='shell__bottombar'>{renderNavItems()}</view>}
      </view>
    </view>
  )
}
