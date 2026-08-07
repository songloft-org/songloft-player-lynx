import { Outlet, useNavigate, useRouterState } from '@tanstack/react-router'

import { NAV_DESTINATIONS } from '../nav/destinations.js'
import { useBreakpoint } from '../responsive/useBreakpoint.js'
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
  const { breakpoint, isWide, onLayoutChange } = useBreakpoint()
  const pathname = useRouterState({ select: s => s.location.pathname })

  const renderNavItems = () =>
    NAV_DESTINATIONS.map(dest => {
      const active = pathname === dest.path
      return (
        <view
          key={dest.path}
          className={active ? 'nav-item nav-item--active' : 'nav-item'}
          bindtap={() => navigate({ to: dest.path })}
        >
          <text className='nav-item__icon'>{dest.icon}</text>
          <text className='nav-item__label'>{dest.label}</text>
        </view>
      )
    })

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

      <view className='shell__body'>
        <Outlet />
      </view>

      {isWide
        ? null
        : <view className='shell__bottombar'>{renderNavItems()}</view>}
    </view>
  )
}
