import type { ReactNode } from '@lynx-js/react'

import {
  PopoverRoot,
  PopoverTrigger,
  PopoverPositioner,
  PopoverBackdrop,
  PopoverContent,
} from '@lynx-js/lynx-ui-popover'

import { useBackHandler } from '../nav/use-back-handler.js'
import { MenuItem } from './MenuItem.js'
import type { MenuItemSpec } from './MenuItem.js'
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
   *
   * Passing `show` puts the popover in *controlled* mode, and in that mode
   * `PopoverTrigger`/`PopoverBackdrop` route **only** through `onVisibleChange`
   * — they never touch internal state. So without this wired up the trigger tap
   * is silently a no-op and the menu can never open. `PopoverRoot`'s `onClose`
   * is not a substitute: that is a Presence *lifecycle* callback that fires
   * after the popover has finished leaving, so relying on it deadlocks (nothing
   * ever sets `show` false, so nothing ever leaves).
   */
  onShowChange: (show: boolean) => void
  /**
   * Tappable content. `triggerClassName` styles the tappable box itself.
   *
   * Pass a fragment for multi-element triggers, **never** a wrapping `<view>`:
   * lynx-ui puts `triggerClassName` on the trigger's own view, so a wrapper
   * becomes an unstyled child — and an unstyled view is Lynx *linear* layout,
   * default direction `column`. That is how both sort chips ended up with the
   * icon stacked above the label. `PopoverTrigger` forwards no unknown props, so
   * a `data-testid` belongs on a real child element (a `<text>`), not on a
   * wrapper added for it; taps bubble from there to the trigger.
   */
  trigger: ReactNode
  triggerClassName?: string
  items: PopoverMenuItem[]
  onSelect: (key: string) => void
  placement?: 'bottom' | 'top' | 'bottom-start' | 'bottom-end' | 'top-start' | 'top-end'
  contentClassName?: string
  hideCheckmark?: boolean
}

/**
 * A generic popover selection menu, reusable for play mode, speed, etc.
 *
 * `PopoverPositioner` is deliberately left without a `container`, which keeps it
 * on the plain `<view>` branch of the underlying overlay. With a `container` it
 * would render a Lynx `<overlay>`, and that tag is absent from web-core's
 * `LYNX_TAG_TO_HTML_TAG_MAP` — on Web it would fall back to `HTMLUnknownElement`
 * and lose its positioning entirely.
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
  /*
   * Back closes the menu. It has to go through `onShowChange` like every other
   * close path: this popover is controlled, and lynx-ui offers no imperative close —
   * `PopoverRoot.onClose` is a Presence lifecycle callback ("finished leaving"), so
   * driving it from here would deadlock (see the prop docs above).
   */
  useBackHandler(show, () => {
    onShowChange(false)
    return true
  })

  return (
    <PopoverRoot show={show} onVisibleChange={onShowChange}>
      <PopoverTrigger className={triggerClassName}>
        {trigger}
      </PopoverTrigger>
      <PopoverPositioner placement={placement} placementOffset={6}>
        <PopoverBackdrop />
        <PopoverContent className={contentClassName ? `popover-menu ${contentClassName}` : 'popover-menu'}>
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
        </PopoverContent>
      </PopoverPositioner>
    </PopoverRoot>
  )
}
