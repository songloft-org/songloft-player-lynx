import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { PluginTabIcon } from '../../features/jsplugin/index.js'
import { getLastLibrarySearch } from '../../features/library/index.js'
import { useBackHandler } from './use-back-handler.js'
import { Icon, ICON_COLORS } from '../ui/Icon.js'
import type { NavDestination } from './destinations.js'
import { BackdropBlur } from '../ui/BackdropBlur.js'
import './MoreTabsSheet.css'

export interface MoreTabsSheetProps {
  /** The overflow destinations — everything past NAV_REAL_SLOTS. */
  items: NavDestination[]
  /** The lit destination (same value the bar's tabs compare against), if any. */
  activePath?: string
  show: boolean
  onShowChange: (show: boolean) => void
}

/**
 * "More" sheet for the folded bottom bar — the Lynx counterpart of the Flutter
 * `adaptive_scaffold.dart` overflow bottom sheet (`_showOverflowSheet`).
 *
 * Same construction as `AddToPlaylistSheet` / `PlayHistoryPanel` (fixed root +
 * sibling backdrop + bottom panel; that pattern's CSS carries the four
 * explicit offsets a fixed box needs). Mounted by `ShellLayout` beside the
 * bottom bar rather than on the root route: the trigger lives in the shell, so
 * local state is enough, and a logout that unmounts the shell closes the sheet
 * with it.
 *
 * Selecting a row navigates exactly the way the bar's tab for the same
 * destination would — the library restores its last search, plugin tabs go to
 * `/plugin/$entryPath` — then closes. `useBackHandler` is armed by `show`, which
 * is false at mount as the back-stack ordering requires (see `back-stack.ts`).
 */
export function MoreTabsSheet({ items, activePath, show, onShowChange }: MoreTabsSheetProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()

  const close = () => onShowChange(false)

  useBackHandler(show, () => {
    close()
    return true
  })

  const select = (dest: NavDestination) => {
    close()
    if (dest.plugin) {
      // Same `tab: true` as the bar's own tab — a sheet row IS a tab entry, so
      // the plugin opens chromeless too.
      navigate({ to: '/plugin/$entryPath', params: { entryPath: dest.plugin.entryPath }, search: { tab: true } })
    } else if (dest.path === '/library') {
      navigate({ to: '/library', search: getLastLibrarySearch() })
    } else {
      navigate({ to: dest.path as '/' })
    }
  }

  if (!show) return null

  return (
    <view className='more-tabs' data-testid='more-tabs-sheet'>
      {/* Real backdrop blur, behind the dim so the page is blurred and then
          darkened. A preceding sibling, not a child: the scrim below owns
          tap-to-dismiss and a child would sit in front of it. */}
      <BackdropBlur />
      {/* Outside-tap close on the backdrop (the panel's sibling), never on this
          root: a tap inside the panel must not be able to reach a close
          handler. Same rule as `PopoverMenu` and `PlayHistoryPanel`. */}
      <view className='more-tabs__backdrop' bindtap={close} data-testid='more-tabs-backdrop' />
      <view className='more-tabs__panel'>
        <view className='more-tabs__handle-wrap'>
          <view className='more-tabs__handle' />
        </view>
        <view className='more-tabs__header'>
          <text className='more-tabs__title'>{t('nav.more')}</text>
        </view>
        <scroll-view className='more-tabs__list' scroll-y>
          {items.map((dest) => {
            const active = activePath === dest.path
            return (
              <view
                key={dest.path}
                className={active ? 'more-tabs__item more-tabs__item--active' : 'more-tabs__item'}
                bindtap={() => select(dest)}
                data-testid={`more-tabs-item-${dest.plugin?.entryPath ?? (dest.path === '/' ? 'home' : dest.path.slice(1))}`}
              >
                <view className='more-tabs__item-icon'>
                  {dest.plugin
                    ? <PluginTabIcon tab={dest.plugin} active={active} />
                    : (
                      <Icon
                        name={dest.icon}
                        size={24}
                        color={active ? ICON_COLORS.primary : ICON_COLORS.contentMuted}
                      />
                    )}
                </view>
                <text className={active ? 'more-tabs__item-label more-tabs__item-label--active' : 'more-tabs__item-label'}>
                  {dest.plugin ? dest.plugin.name : t(dest.labelKey)}
                </text>
              </view>
            )
          })}
        </scroll-view>
      </view>
    </view>
  )
}
