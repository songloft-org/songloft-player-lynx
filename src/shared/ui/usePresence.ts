import { useEffect, useState } from '@lynx-js/react'

import { getReduceMotion } from '../theme/reduce-motion-model.js'

/**
 * Keeps a subtree mounted through its leave animation, then unmounts it.
 *
 * The hand-rolled modal sheets (`PlaylistDrawer`, `SleepTimerSheet`,
 * `AddToPlaylistSheet`, `ManageTagsSheet`) mount with
 * `if (!show) return null`, which tears the panel down the instant `show` flips
 * false — so a leave animation has nothing to play on. This hook splits that
 * flip: `show` going false enters a `leaving` phase (still mounted, so the leave
 * CSS runs), and the unmount is deferred until the leave duration elapses.
 * `ConfirmDialog` gets the same effect from `lynx-ui-presence`'s `ui-leaving` +
 * `transitionend`; this is the equivalent for surfaces that do not sit inside a
 * `DialogRoot`. (`MoreTabsSheet`/the anchored popovers
 * stay instant-unmount by design — see their own comments.)
 *
 * Teardown is on a **timeout**, not `transitionend`/`animationend`: this repo
 * measured `animationend` as unreliable on Lynx (see `ToastHost.tsx`), and a
 * timeout does not depend on the leave CSS being wired correctly to fire its
 * event. The cost is a fixed wait even if the transition finishes early; the
 * wait is short and the element is invisible by then, so it does not show.
 *
 * Under reduce-motion the CSS durations are zero, so the leave visual is
 * instant — and the hook collapses to a synchronous unmount too, so no invisible
 * element lingers for the timeout. The flag comes from `reduce-motion-model`,
 * which the host pushes via `SystemAppearance` (batch 5).
 */
const LEAVE_MS = 280 // ≈ --duration-normal (250ms) + a small tail for slow paints

export interface UsePresenceResult {
  /** Whether the subtree should render at all. */
  mounted: boolean
  /** True during the leave phase — apply the leave class while this is set. */
  leaving: boolean
}

export function usePresence(show: boolean): UsePresenceResult {
  const [state, setState] = useState<{ mounted: boolean; leaving: boolean }>(() => ({
    mounted: show,
    leaving: false,
  }))

  useEffect(() => {
    if (show) {
      // Opening (or re-opening mid-leave): mount fresh and cancel any pending
      // teardown from a leave that was in flight. Return the SAME ref when the
      // state is already the shown one, so a sheet that mounts with show=true
      // does not re-render (and re-run its children) a second time for nothing.
      setState((prev) =>
        prev.mounted && !prev.leaving ? prev : { mounted: true, leaving: false },
      )
      return
    }
    // Closing: if it was on screen, enter the leave phase and schedule the
    // unmount. A sheet that was never mounted (show started false) stays gone.
    setState((prev) => (prev.mounted ? { mounted: true, leaving: true } : prev))
    if (getReduceMotion()) {
      // reduce-motion: the leave visual is instant (0ms tokens), so unmount now
      // rather than holding an invisible subtree for the timeout.
      setState({ mounted: false, leaving: false })
      return
    }
    const id = setTimeout(() => setState({ mounted: false, leaving: false }), LEAVE_MS)
    return () => clearTimeout(id)
  }, [show])

  return state
}

