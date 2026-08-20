import type { ReactNode } from '@lynx-js/react'

import {
  PopoverRoot,
  PopoverTrigger,
  PopoverPositioner,
  PopoverBackdrop,
  PopoverContent,
} from '@lynx-js/lynx-ui-popover'

import { useBackHandler } from '../nav/use-back-handler.js'
// Deliberately the menu's stylesheet, not one of its own. See the note below.
import './PopoverMenu.css'

export interface PopoverPanelProps {
  show: boolean
  /**
   * Every visibility request the popover makes: trigger taps (toggle) and backdrop
   * taps (close). Must write the same state that feeds `show`.
   *
   * Passing `show` puts the popover in *controlled* mode, and in that mode
   * `PopoverTrigger`/`PopoverBackdrop` route **only** through this callback — they
   * never touch internal state. Leave it unwired and the trigger tap is silently a
   * no-op, so the panel can never open. `PopoverRoot`'s `onClose` is not a
   * substitute: that is a Presence *lifecycle* callback which fires after the popover
   * has finished leaving, so relying on it deadlocks (nothing ever sets `show` false,
   * so nothing ever leaves).
   */
  onShowChange: (show: boolean) => void
  /** Tappable content. `triggerClassName` styles the tappable box itself. */
  trigger: ReactNode
  triggerClassName?: string
  /** Panel body. Anything — a slider, a form, a grid. */
  children: ReactNode
  placement?: 'bottom' | 'top' | 'bottom-start' | 'bottom-end' | 'top-start' | 'top-end'
  contentClassName?: string
}

/**
 * A popover whose body is arbitrary content, rather than the list of labelled rows
 * {@link PopoverMenu} renders.
 *
 * A sibling of `PopoverMenu` instead of an extra `children` prop on it: the two would
 * be mutually exclusive with `items`, which is not something the type can express
 * cleanly, and every call site would then have to be read to know which mode it is in.
 *
 * **It imports `PopoverMenu.css` on purpose.** Two rules in there are load-bearing and
 * were each a shipped bug:
 *
 *  - `.popover-backdrop { top: 0; left: 0 }` patches lynx-ui's own rule, which sizes
 *    the backdrop `100vw × 100vh` but gives it no offsets — so it covered a screenful
 *    measured *from the popover*, and two popovers could be open at once.
 *  - `.popover-menu` declares a `transition`, which is what lets Presence leave its
 *    `Leaving` state on `transitionend` instead of spinning 24 single-frame
 *    `requestAnimationFrame` hops across the thread boundary (~1s of visible lag).
 *
 * Both are keyed to those class names, and `popover-menu-css.test.ts` pins them. A
 * private stylesheet here would have to re-derive both and would silently rot.
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
  // Back closes the panel, through `onShowChange` like every other close path — this
  // popover is controlled and lynx-ui offers no imperative close (see the prop docs).
  useBackHandler(show, () => {
    onShowChange(false)
    return true
  })

  return (
    <PopoverRoot show={show} onVisibleChange={onShowChange}>
      <PopoverTrigger className={triggerClassName}>
        {trigger}
      </PopoverTrigger>
      {/* No `container`: that switches the positioner to a Lynx `<overlay>`, a tag
          absent from web-core's tag map, which degrades to `HTMLUnknownElement` on
          Web and loses positioning entirely. */}
      <PopoverPositioner placement={placement} placementOffset={6}>
        <PopoverBackdrop />
        <PopoverContent
          className={contentClassName
            ? `popover-menu popover-panel ${contentClassName}`
            : 'popover-menu popover-panel'}
        >
          {children}
        </PopoverContent>
      </PopoverPositioner>
    </PopoverRoot>
  )
}
