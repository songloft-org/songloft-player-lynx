import type { ReactNode } from '@lynx-js/react'

import { MenuItem } from './MenuItem.js'
import type { MenuItemSpec } from './MenuItem.js'
import { PopoverSurface } from './PopoverSurface.js'
import type { Placement } from './anchored-overlay.js'
import './PopoverMenu.css'

/**
 * Kept as an alias so the many call sites that import `PopoverMenuItem` stay
 * valid; the shape itself now lives with the shared row (`MenuItem.tsx`).
 */
export type PopoverMenuItem = MenuItemSpec

export interface PopoverMenuProps {
  show: boolean
  /**
   * Every visibility request the popover makes: trigger taps (toggle) and
   * backdrop taps (close). Must write the same state that feeds `show`.
   */
  onShowChange: (show: boolean) => void
  /**
   * Tappable content. `triggerClassName` styles the tappable box itself.
   *
   * Pass a fragment for multi-element triggers, **never** a wrapping `<view>`:
   * `triggerClassName` goes on the trigger's own view, so a wrapper becomes an
   * unstyled child — and an unstyled view is Lynx *linear* layout, default
   * direction `column`. That is how both sort chips once ended up with the icon
   * stacked above the label. A `data-testid` belongs on a real child element (a
   * `<text>`); taps bubble from there to the trigger.
   */
  trigger: ReactNode
  triggerClassName?: string
  items: PopoverMenuItem[]
  onSelect: (key: string) => void
  placement?: Placement
  contentClassName?: string
  hideCheckmark?: boolean
}

/**
 * A generic popover selection menu, reusable for play mode, speed, sort, etc.
 *
 * Positioning is ours (`anchored-overlay.ts`), not `@lynx-js/lynx-ui-popover`'s —
 * that module's header explains what the library's positioner gets wrong and what
 * it cost. The visible rows are the same `MenuItem` as `GlobalMenu`, so the two
 * menus cannot drift apart.
 */
export function PopoverMenu({
  show,
  onShowChange,
  trigger,
  triggerClassName,
  items,
  onSelect,
  placement = 'bottom',
  contentClassName,
  hideCheckmark,
}: PopoverMenuProps) {
  return (
    <PopoverSurface
      show={show}
      onShowChange={onShowChange}
      trigger={trigger}
      triggerClassName={triggerClassName}
      placement={placement}
      panelClassName={contentClassName ? `popover-menu ${contentClassName}` : 'popover-menu'}
    >
      {items.map((item) => (
        <MenuItem
          key={item.key}
          item={item}
          hideCheckmark={hideCheckmark}
          onTap={() => {
            onSelect(item.key)
            onShowChange(false)
          }}
        />
      ))}
    </PopoverSurface>
  )
}
