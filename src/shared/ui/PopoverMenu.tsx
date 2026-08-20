import type { ReactNode } from '@lynx-js/react'

import {
  PopoverRoot,
  PopoverTrigger,
  PopoverPositioner,
  PopoverBackdrop,
  PopoverContent,
} from '@lynx-js/lynx-ui-popover'

import { useBackHandler } from '../nav/use-back-handler.js'
import { Icon, ICON_COLORS } from './Icon.js'
import type { IconName } from './icons.js'
import './PopoverMenu.css'

export interface PopoverMenuItem {
  key: string
  label: string
  icon?: IconName
  selected?: boolean
}

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
  /** Tappable content. `triggerClassName` styles the tappable box itself. */
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
            <view
              key={item.key}
              className={item.selected
                ? 'popover-menu__item popover-menu__item--selected'
                : 'popover-menu__item'}
              bindtap={() => {
                onSelect(item.key)
                onShowChange(false)
              }}
            >
              {item.icon != null && (
                <view className='popover-menu__item-icon'>
                  <Icon
                    name={item.icon}
                    size={20}
                    color={item.selected ? ICON_COLORS.primary : ICON_COLORS.content}
                  />
                </view>
              )}
              <text className={item.selected
                ? 'popover-menu__item-label popover-menu__item-label--selected'
                : 'popover-menu__item-label'}>
                {item.label}
              </text>
              {item.selected && !hideCheckmark && (
                <view className='popover-menu__item-check'>
                  <Icon name='check' size={16} color={ICON_COLORS.primary} />
                </view>
              )}
            </view>
          ))}
        </PopoverContent>
      </PopoverPositioner>
    </PopoverRoot>
  )
}
