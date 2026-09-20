import type { ReactNode } from '@lynx-js/react'

import { useBackHandler } from '../nav/use-back-handler.js'
import { BackdropBlur } from './BackdropBlur.js'
import { useAnchoredOverlay } from './anchored-overlay.js'
import type { Placement } from './anchored-overlay.js'
import './overlay-motion.css'
import './PopoverMenu.css'

export interface PopoverSurfaceProps {
  show: boolean
  /** Trigger taps (toggle) and backdrop taps (close) both route through here. */
  onShowChange: (show: boolean) => void
  trigger: ReactNode
  triggerClassName?: string
  placement: Placement
  /**
   * Overrides the generated anchor id. For an owner that has to address the same
   * trigger itself — the player's overflow menu re-measures its `⋯` to anchor the
   * song menu it hands off to.
   */
  anchorId?: string
  /** Classes for the floating panel. Always includes a `.popover-menu`-family class. */
  panelClassName: string
  children: ReactNode
}

/**
 * The trigger + backdrop + anchored panel shell that `PopoverMenu` and
 * `PopoverPanel` share.
 *
 * Extracted rather than duplicated because the two differ only in what goes
 * inside the panel, and the parts that are easy to get wrong are all out here:
 *
 *  - **The panel is a sibling of the trigger, not a child.** A child would inherit
 *    the trigger's `overflow`/paint clipping and, worse, its tap handler.
 *  - **The outside-tap catcher is the backdrop, a sibling of the panel** — so a tap
 *    on a menu row cannot reach it. Putting the close handler on a shared root and
 *    relying on `catchtap` in the panel to stop the bubble works on device but is
 *    untestable, since the test env does not implement that interception.
 *  - **The panel's blur is a child of the panel, not of the backdrop.** A popover
 *    is not modal, so there is no scrim to dim and nothing page-sized to blur; the
 *    material is the panel itself. That is the one place the modal mounting rule
 *    inverts — see `BackdropBlur.tsx`.
 *  - **The panel mounts only while shown.** Not `visibility: hidden`: a mounted
 *    panel keeps its rows tappable on some hosts, and mounting on open is what
 *    makes the measurement fresh.
 *  - **The position is measured ahead of the tap, not during it.** `boundingClientRect`
 *    answers asynchronously, so measuring on tap and opening in the callback would
 *    stall the menu behind a round trip; measuring *in* the callback-less direction
 *    (open now, place later) would paint once at the fallback and jump.
 *    `useAnchoredOverlay` measures on mount so the first open is already right, and
 *    the tap only kicks off a refresh for anything that has moved since.
 *
 * The back key is claimed **here**, once, rather than in each wrapper: both wrappers
 * pass their own `show` straight through, so registering in the wrapper as well would
 * put two handlers on the back stack for one visible panel — the first press would
 * close it correctly, and the second would be eaten by the sibling that had not
 * unregistered yet. `overlay-back-contract.test.tsx` derives this delegation rather
 * than being told about it.
 */
export function PopoverSurface({
  show,
  onShowChange,
  trigger,
  triggerClassName,
  placement,
  anchorId: anchorIdProp,
  panelClassName,
  children,
}: PopoverSurfaceProps) {
  const { anchorId, position, refresh } = useAnchoredOverlay(placement, anchorIdProp)

  // Through `onShowChange` like every other close path — these popovers are
  // controlled, so their visibility only ever changes by the owner writing state.
  useBackHandler(show, () => {
    onShowChange(false)
    return true
  })

  const onTriggerTap = () => {
    if (show) {
      onShowChange(false)
      return
    }
    // Refresh first, then open. The refresh is async, so this open still paints
    // with the position measured on mount (or on the previous open) — which is why
    // that mount measurement exists. See `useAnchoredOverlay`.
    refresh()
    onShowChange(true)
  }

  return (
    <>
      <view id={anchorId} className={triggerClassName} bindtap={onTriggerTap}>
        {trigger}
      </view>
      {show
        ? (
          <>
            <view
              className='popover-backdrop'
              bindtap={() => onShowChange(false)}
              data-testid='popover-backdrop'
            />
            <view className={`${panelClassName} overlay--enter-scale`} style={position}>
              {/*
               * Panel-mode blur: the material *is* the panel here, so the layer
               * goes inside it rather than behind a scrim — a popover has no
               * scrim, which is exactly why its 0.72 fill was reading as a
               * see-through wash over sharp page content. First child and
               * `z-index: -1`, so it sits under the rows without touching their
               * taps; see `BackdropBlur.tsx`.
               */}
              <BackdropBlur className='ui-backdrop-blur--panel' container />
              {children}
            </view>
          </>
        )
        : null}
    </>
  )
}
