import { useCallback, useRef } from '@lynx-js/react'
import type { ScrollEvent } from '@lynx-js/types'

/**
 * Per-page scroll offsets, remembered across unmounts so that returning from a
 * sub-page lands where you left off instead of back at the top.
 *
 * Session-only, module-level — the same shape as `last-library-search` and
 * `shell-navigation`, which solve the sibling "remember where I was" problems for
 * the library's sub-tab and the player's return tab. Deliberately not persisted:
 * after a cold start the top of the page is where you want to be.
 *
 * A `useRef` inside the page cannot do this job: the shell's sub-pages are
 * *sibling* routes (`/settings/cache` is not nested under `/settings`), so opening
 * one unmounts the list page and takes any per-mount state with it.
 */
const offsets = new Map<string, number>()

/** Remembered offset for `key` — 0 for a page not scrolled yet this session. */
export function getScrollOffset(key: string): number {
  return offsets.get(key) ?? 0
}

export function setScrollOffset(key: string, offset: number): void {
  // iOS reports a negative `scrollTop` while the bounce spring is stretched past
  // the top edge; storing that would restore the page into the bounce region.
  offsets.set(key, offset > 0 ? offset : 0)
}

/** Exported for tests — module state outlives an individual `render()`. */
export function clearScrollMemory(): void {
  offsets.clear()
}

export interface UseScrollMemoryResult {
  /**
   * Offset to restore, read **once** at mount and then held constant for the
   * lifetime of the mount. `initial-scroll-offset` acts when its attribute
   * *changes*, so a value that tracked the live position would re-issue a
   * programmatic scroll on every unrelated re-render and fight the user's finger.
   */
  initialOffset: number
  /** Attach to the scroll view's `bindscroll`. */
  onScroll: (event: ScrollEvent) => void
}

/**
 * Restores, then records, the scroll offset of the `<scroll-view>` it is wired to.
 *
 * ```tsx
 * const { initialOffset, onScroll } = useScrollMemory('settings')
 * <scroll-view scroll-y initial-scroll-offset={initialOffset} bindscroll={onScroll} />
 * ```
 *
 * **Use `initial-scroll-offset`, not `scroll-top`.** Checked against all three
 * SDKs rather than assumed, because the docs give no per-platform matrix for
 * either one:
 * - `initial-scroll-offset` is wired on every path (`UIScrollView` +
 *   `LynxUIScrollView` on Android, `LynxUIScroller` + `LynxUIScrollView` on iOS,
 *   `ScrollAttributes` in `@lynx-js/web-elements`), and every one of them **defers
 *   it until the content is laid out** — Android retries from
 *   `handleComputeScroll()` until `offset + height <= contentHeight`, iOS queues a
 *   `scrollReadyBlock`, web waits one `requestAnimationFrame`. Restoring at mount
 *   needs exactly that: the content is not measured yet when the attribute lands.
 * - `scroll-top` is absent from **both** new-arch scrollers, and on Android's
 *   default path it is the *immediate* variant. It adds no coverage.
 *
 * The offset round-trips in a single unit: Android's
 * `LynxScrollEvent.setScrollParams` reports `scrollTop` through `pxToDip` and
 * `setInitialScrollOffset` puts it back through `dipToPx`. Handing that prop a raw
 * px value would overshoot by the display density and land at the page bottom.
 */
export function useScrollMemory(key: string): UseScrollMemoryResult {
  const initialOffset = useRef(getScrollOffset(key)).current

  const onScroll = useCallback(
    (event: ScrollEvent) => {
      setScrollOffset(key, event.detail.scrollTop)
    },
    [key],
  )

  return { initialOffset, onScroll }
}
