import { Icon, ICON_COLORS } from './Icon.js'
import type { IconName } from './icons.js'

export interface MenuItemSpec {
  key: string
  label: string
  icon?: IconName
  selected?: boolean
  /** When selected, show this icon instead of the default ✓ checkmark. */
  selectedIcon?: IconName
  /** Destructive actions (delete): icon + label in the danger color. */
  danger?: boolean
}

export interface MenuItemProps {
  item: MenuItemSpec
  onTap: () => void
  /** Suppress the trailing checkmark on selected rows (menus that are not pickers). */
  hideCheckmark?: boolean
}

/**
 * One row of a menu — shared by `PopoverMenu` (anchored to its trigger) and
 * `GlobalMenu` (top-level, mounted in the root route).
 *
 * Extracted so the two menus cannot drift: the song menu used to be a
 * hand-rolled panel with its own item markup and its own stylesheet, which is
 * how the app ended up with two different-looking menus. The classes stay
 * `popover-menu__item*` and live in `PopoverMenu.css` — that stylesheet is the
 * one both menus load.
 */
export function MenuItem({ item, onTap, hideCheckmark }: MenuItemProps) {
  return (
    <view
      className={item.selected
        ? 'popover-menu__item popover-menu__item--selected'
        : 'popover-menu__item'}
      bindtap={onTap}
      data-testid={`menu-item-${item.key}`}
    >
      {item.icon != null && (
        <view className='popover-menu__item-icon'>
          <Icon
            name={item.icon}
            size={20}
            color={item.danger
              ? ICON_COLORS.danger
              : item.selected
                ? ICON_COLORS.primary
                : ICON_COLORS.content}
          />
        </view>
      )}
      <text className={item.danger
        ? 'popover-menu__item-label popover-menu__item-label--danger'
        : item.selected
          ? 'popover-menu__item-label popover-menu__item-label--selected'
          : 'popover-menu__item-label'}>
        {item.label}
      </text>
      {item.selected && !hideCheckmark && (
        <view className='popover-menu__item-check'>
          <Icon name={item.selectedIcon ?? 'check'} size={16} color={ICON_COLORS.primary} />
        </view>
      )}
    </view>
  )
}
