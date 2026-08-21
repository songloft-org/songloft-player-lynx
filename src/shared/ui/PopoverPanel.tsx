import type { ReactNode } from '@lynx-js/react'

import { PopoverSurface } from './PopoverSurface.js'
import type { Placement } from './anchored-overlay.js'
// Deliberately the menu's stylesheet, not one of its own. See the note below.
import './PopoverMenu.css'

export interface PopoverPanelProps {
  show: boolean
  /**
   * Every visibility request the popover makes: trigger taps (toggle) and backdrop
   * taps (close). Must write the same state that feeds `show`.
   */
  onShowChange: (show: boolean) => void
  /** Tappable content. `triggerClassName` styles the tappable box itself. */
  trigger: ReactNode
  triggerClassName?: string
  /** Panel body. Anything — a slider, a form, a grid. */
  children: ReactNode
  placement?: Placement
  contentClassName?: string
}

/**
 * A popover whose body is arbitrary content, rather than the list of labelled rows
 * `PopoverMenu` renders.
 *
 * A sibling of `PopoverMenu` instead of an extra `children` prop on it: the two would
 * be mutually exclusive with `items`, which is not something the type can express
 * cleanly, and every call site would then have to be read to know which mode it is in.
 * The shell they share lives in `PopoverSurface`.
 *
 * **It imports `PopoverMenu.css` on purpose.** The panel surface (paper, radius,
 * shadow, border), the backdrop and the anchored base all live in that one
 * stylesheet, keyed to `.popover-menu` / `.popover-backdrop`, and both popovers plus
 * `GlobalMenu` load it. A private stylesheet here would re-derive them and rot.
 */
export function PopoverPanel({
  show,
  onShowChange,
  trigger,
  triggerClassName,
  children,
  placement = 'top',
  contentClassName,
}: PopoverPanelProps) {
  return (
    <PopoverSurface
      show={show}
      onShowChange={onShowChange}
      trigger={trigger}
      triggerClassName={triggerClassName}
      placement={placement}
      panelClassName={contentClassName
        ? `popover-menu popover-panel ${contentClassName}`
        : 'popover-menu popover-panel'}
    >
      {children}
    </PopoverSurface>
  )
}
