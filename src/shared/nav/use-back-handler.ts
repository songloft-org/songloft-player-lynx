import { useEffect, useRef } from '@lynx-js/react'

import { pushBackHandler, type BackHandler } from './back-stack.js'

/**
 * Claim the back key for as long as `active` is true.
 *
 * `handler` returns true when it consumed the press. Anything that renders over
 * the page — dialog, sheet, popover, context menu — or that puts the page into a
 * mode the user expects back to leave (multi-select, reorder, inline edit) should
 * call this.
 *
 * **`active` must be false at mount.** Priority is activation order (see
 * `back-stack.ts`), so a layer that registers while its page is mounting can end
 * up below a parent's handler. Drive `active` from the same state that decides
 * whether the layer is visible and this is automatic.
 *
 * `handler` is read through a ref so a re-render does **not** re-register: doing
 * that would move this layer back to the top of the stack on every render of the
 * page, and a parent re-rendering would start outranking an overlay the user
 * opened afterwards.
 */
export function useBackHandler(active: boolean, handler: BackHandler): void {
  const latest = useRef(handler)
  latest.current = handler

  useEffect(() => {
    if (!active) return
    return pushBackHandler(() => latest.current())
  }, [active])
}
