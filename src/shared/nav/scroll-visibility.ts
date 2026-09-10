import { useCallback, useEffect } from '@lynx-js/react'
import type { ScrollEvent } from '@lynx-js/types'

/**
 * Cross-layer "is the page scrolled past its top edge" signal — the scroll-edge
 * effect that deepens the floating glass capsule's shadow when content rolls
 * under it, Apple's own scroll-edge treatment for a floating bar.
 *
 * The shell's bottom capsule and mini-player live in `ShellLayout`, but the
 * scroller that decides whether they are "over content" lives in whatever page
 * `<Outlet />` is rendering — a sibling the shell cannot reach through props.
 * So, like `shell-navigation.ts`'s `shellWidth`, the signal is a session-only
 * module-level store with a `subscribe` the shell reads through
 * `useSyncExternalStore`, and the pages write to it through `bindscroll`.
 *
 * What this is NOT: a scroll-offset store. Only the boolean crosses the layer
 * boundary — the offset itself is per-page business (restored by
 * `scroll-memory.ts`) and shipping it would couple the shell to every page's
 * bounce/overscroll semantics. The threshold collapses all of that to one bit.
 */

/** Pixels of scroll at which a page counts as "scrolled". Small, so the edge
 *  effect engages the moment content begins to pass under the capsule rather
 *  than after a full row — Apple's bars respond at the same first-pixel feel. */
export const SCROLL_EDGE_THRESHOLD = 8

let scrolled = false
const listeners = new Set<() => void>()

export function getIsScrolled(): boolean {
  return scrolled
}

/** Set the signal directly. No-op on no change, so a `bindscroll` storm does not
 *  turn into a render storm — the shell only re-renders on the boolean edge. */
export function setIsScrolled(next: boolean): void {
  if (scrolled === next) return
  scrolled = next
  for (const l of listeners) l()
}

export function subscribeIsScrolled(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

/** Exported for tests — module state outlives an individual `render()`. */
export function clearScrollVisibility(): void {
  scrolled = false
  for (const l of listeners) l()
}

/** Collapse a raw scroll offset to the boolean and publish it. */
export function reportScrollOffset(offset: number): void {
  setIsScrolled(offset > SCROLL_EDGE_THRESHOLD)
}

export interface UseScrollNotifierResult {
  /** Attach to the scroller's `bindscroll`. */
  onScroll: (event: ScrollEvent) => void
}

/**
 * Wires a page's scroller into the cross-layer signal.
 *
 * On mount and on unmount the signal is forced to `false`: landing on a page
 * always starts at the top (so the capsule is at its resting glass), and leaving
 * a scrolled page must drop the edge state rather than leave the capsule
 * darkened for the next page's first frame. A page that restores a non-zero
 * offset via `scroll-memory.ts` will fire `bindscroll` again as the restore
 * lands, re-engaging the edge — the reset only buys one clean frame.
 *
 * ```tsx
 * const { onScroll } = useScrollNotifier()
 * <scroll-view scroll-y bindscroll={onScroll} />
 * ```
 */
export function useScrollNotifier(): UseScrollNotifierResult {
  useEffect(() => {
    setIsScrolled(false)
    return () => setIsScrolled(false)
  }, [])
  const onScroll = useCallback((event: ScrollEvent) => {
    reportScrollOffset(event.detail.scrollTop)
  }, [])
  return { onScroll }
}
