import { useCallback, useEffect, useRef, useState } from '@lynx-js/react'

/**
 * Anchoring for the app's popovers — the replacement for
 * `@lynx-js/lynx-ui-popover`'s positioner.
 *
 * ## Why we do not use the library's positioner
 *
 * `computeCoordsFromPlacement` returns coordinates **relative to the trigger**
 * (its own comment says so: Lynx makes every view `position: relative`, so the
 * library gave up on viewport coordinates), and `OverlayView` then applies them
 * with `position: absolute` — whose containing block is the nearest *positioned
 * ancestor*, not the trigger. The two agree only when the trigger happens to sit
 * at that ancestor's origin. Six of this app's eight call sites put the popover
 * inside a multi-child toolbar row, so every one of them was off by the trigger's
 * offset within the row. Browser-measured before the rewrite: the playlist detail
 * sort menu landed at `x = -122` (fully off-screen — the feature was dead), the
 * player's volume panel at `x = -60`, the speed menu at `x = -30`, the library
 * sort menu at `x = 0` instead of `106`. The player's overflow menu was correct
 * purely because its trigger is the only child of its container.
 *
 * The library's own overflow clamping cannot rescue this either: `detectOverflow`
 * bounds against `SystemInfo.pixelWidth / pixelRatio`, which on Web reports the
 * browser *screen* (measured: 800×600 against a 420×900 lynx-view).
 *
 * ## What this does instead
 *
 * Measure the trigger through `boundingClientRect` — the same invoke
 * `useBreakpoint` uses, defined on both hosts and (per web-core's
 * `createInvokeUIMethod`) reported lynx-view-relative on Web, matching native's
 * page coordinates. Then place a `position: fixed` panel from that rect.
 *
 * The panel is positioned by **edges only** (`left`/`right`/`top`/`bottom` plus a
 * `max-width`/`max-height` cap), never by a computed corner. That is the whole
 * trick: an edge-anchored box needs no knowledge of the panel's own size, so
 * there is no measure-render-remeasure pass, no frame where the panel is visible
 * at the wrong place, and staying on screen is guaranteed by construction rather
 * than by a clamp that can be fed the wrong viewport.
 */

/** A measured box in lynx-view space (what `boundingClientRect` reports). */
export interface AnchorRect {
  left: number
  top: number
  width: number
  height: number
}

export type Placement =
  | 'bottom'
  | 'top'
  | 'bottom-start'
  | 'bottom-end'
  | 'top-start'
  | 'top-end'

/**
 * Inline style for the panel: exactly one horizontal and one vertical edge, plus
 * size caps, so the panel's own width and height never enter the computation.
 *
 * Exactly one edge per axis is a hard requirement, not tidiness: a `position:
 * fixed` box given both `top` and `bottom` is *stretched* between them rather than
 * sized by its content. That is also why `PopoverMenu.css` declares no offsets at
 * all — a leftover `bottom` there would combine with an inline `top` and pull the
 * panel down the whole screen, which no override can undo.
 */
export interface PanelPosition {
  left?: string
  right?: string
  top?: string
  bottom?: string
  maxWidth: string
  maxHeight: string
}

/** Gap between the trigger and the panel. */
const GAP = 6
/** Smallest allowed distance from the panel to the edge of the viewport. */
const MARGIN = 8
/**
 * Width the anchored edge always leaves room for — a fixed bound at or above every
 * panel in the app. The widest is `.popover-menu--wide` at 180px (the volume panel
 * used to be the 200px one, until its slider went vertical and it shrank to 84);
 * the extra 20px is slack so a new panel does not silently outgrow this.
 *
 * A bound rather than the real width because `max-width` cannot be trusted to
 * shrink a panel: CSS resolves `min-width` *after* it, so `.popover-menu--wide`'s
 * `min-width: 180px` wins over any smaller cap this module computes. Reserving the
 * room on the offset instead is the only version that holds. It only ever bites for
 * a trigger within 200px of the edge it opens away from, where there is nowhere
 * better for the panel to be.
 */
const RESERVED_PANEL_WIDTH = 200

function clamp(min: number, value: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max))
}

/**
 * Resolve the un-aligned placements (`'bottom'` / `'top'`) to a side.
 *
 * True centering would need the panel's width, which is exactly the dependency
 * this module exists to avoid. Picking the side with more room instead keeps the
 * panel on screen for any panel size, and for a trigger near either edge — where
 * centering breaks — it is also what centering would have degraded into. Both
 * call sites that pass an un-aligned placement (the player's volume and speed
 * buttons) were off-screen before this.
 */
function resolveAlignment(
  placement: Placement,
  anchor: AnchorRect,
  viewportWidth: number,
): 'start' | 'end' {
  if (placement.endsWith('-start')) return 'start'
  if (placement.endsWith('-end')) return 'end'
  const center = anchor.left + anchor.width / 2
  return center <= viewportWidth / 2 ? 'start' : 'end'
}

/**
 * Turn a measured trigger rect into panel edge offsets.
 *
 * `viewport` is the lynx-view box, not the device screen — the coordinates come
 * from `boundingClientRect`, which is lynx-view-relative.
 *
 * Vertical side is honoured as asked rather than flipped when short on room: a
 * menu that jumps to the other side of its button between two openings is worse
 * than one that scrolls, and the `max-height` cap means it always fits.
 */
export function placePanel(
  anchor: AnchorRect,
  viewport: { width: number, height: number },
  placement: Placement,
): PanelPosition {
  const side = placement.startsWith('top') ? 'top' : 'bottom'
  const alignment = resolveAlignment(placement, anchor, viewport.width)

  // Both branches clamp the offset to keep `RESERVED_PANEL_WIDTH` on screen, so a
  // trigger near the edge it opens away from drags the panel back into view instead
  // of hanging off it. `max-width` is still emitted, but only as the cap for panels
  // that have no `min-width` fighting it.
  const room = Math.max(MARGIN, viewport.width - MARGIN - RESERVED_PANEL_WIDTH)
  const horizontal = alignment === 'start'
    ? (() => {
      const left = clamp(MARGIN, anchor.left, room)
      return { left: `${left}px`, maxWidth: `${Math.max(0, viewport.width - left - MARGIN)}px` }
    })()
    : (() => {
      const right = clamp(MARGIN, viewport.width - (anchor.left + anchor.width), room)
      return { right: `${right}px`, maxWidth: `${Math.max(0, viewport.width - right - MARGIN)}px` }
    })()

  const vertical = side === 'bottom'
    ? (() => {
      const top = anchor.top + anchor.height + GAP
      return {
        top: `${top}px`,
        maxHeight: `${Math.max(0, viewport.height - top - MARGIN)}px`,
      }
    })()
    : (() => {
      const bottom = viewport.height - anchor.top + GAP
      return {
        bottom: `${bottom}px`,
        maxHeight: `${Math.max(0, viewport.height - bottom - MARGIN)}px`,
      }
    })()

  return { ...horizontal, ...vertical }
}

/**
 * Vertical side for an anchor that can be **anywhere** on screen, i.e. a row in a
 * list rather than a button in a toolbar.
 *
 * The toolbar popovers pass a fixed placement on purpose (`placePanel` never flips
 * one): a menu that jumps to the other side of its own button between two openings
 * is worse than one that scrolls. A list row has no such expectation — the same
 * `⋯` button is at the top of the screen for one song and at the bottom for the
 * next, and a bottom-anchored menu on the last visible row would be capped to a
 * few scrolling pixels. Picking the half with more room needs no knowledge of the
 * panel's height, so it keeps the module's one rule intact.
 *
 * `-end` because the row's `⋯` sits at the row's trailing edge.
 */
export function pickMenuPlacement(m: AnchorMeasurement): Placement {
  const belowMidpoint = m.anchor.top + m.anchor.height > m.viewport.height / 2
  return belowMidpoint ? 'top-end' : 'bottom-end'
}

/**
 * The selector of the app root, whose box is the viewport for `position: fixed`
 * children. `.theme-root` wraps every route (see `router.tsx`) and is the same
 * box `boundingClientRect` reports coordinates against.
 */
const VIEWPORT_SELECTOR = '.theme-root'

interface RectResult {
  left?: number
  top?: number
  width?: number
  height?: number
}

function isUsableRect(r: RectResult | undefined): r is Required<RectResult> {
  return r != null
    && Number.isFinite(r.left) && Number.isFinite(r.top)
    && Number.isFinite(r.width) && Number.isFinite(r.height)
    && (r.width as number) > 0 && (r.height as number) > 0
}

export interface AnchorMeasurement {
  anchor: AnchorRect
  viewport: { width: number, height: number }
}

/**
 * Measure the trigger and the viewport in **one** `SelectorQuery.exec`, calling
 * `done` when both have arrived.
 *
 * One exec rather than two because the pair describes a single layout at a single
 * instant; measured separately, a panel opened while something is still settling
 * gets a trigger rect from before and a viewport from after.
 *
 * `done` is called **exactly once**, with `null` when there is no measurement to be
 * had — no invoke bridge (unit tests, hosts without `boundingClientRect`) or a
 * selector that matched nothing. Reporting the failure *through the callback* rather
 * than as a return value is what lets a caller both open on the answer and still
 * open without one: `invoke`'s callbacks are asynchronous, so "did it fail?" cannot
 * be read after `exec()` — an earlier draft did exactly that and therefore always
 * concluded "no measurement" and always docked the panel. The no-bridge `null`
 * arrives synchronously, so a menu that opens from this callback still opens in the
 * same tick when there is no bridge at all.
 */
export function measureAnchor(
  anchorSelector: string,
  done: (result: AnchorMeasurement | null) => void,
): void {
  // Guards the "exactly once" promise against a throw from `exec()` after the
  // invokes have been queued.
  let delivered = false
  const deliver = (result: AnchorMeasurement | null) => {
    if (delivered) return
    delivered = true
    done(result)
  }
  try {
    // `lynx` is a **bare** host global, not a property of `globalThis` — reading
    // it as `globalThis.lynx` yields undefined in the background realm. Same rule
    // as `fetch` (AGENTS §4) and `useBreakpoint`'s `measureRect`.
    if (typeof lynx === 'undefined' || typeof lynx.createSelectorQuery !== 'function') {
      deliver(null)
      return
    }
    let anchor: RectResult | undefined
    let viewport: RectResult | undefined
    let settled = 0
    // Both invokes report independently and in no guaranteed order, so the result
    // is assembled once *both* have answered — success or failure alike, otherwise
    // one failing selector would leave the pair permanently half-filled.
    const settle = () => {
      if (++settled < 2) return
      deliver(
        isUsableRect(anchor) && isUsableRect(viewport)
          ? {
            anchor: { left: anchor.left, top: anchor.top, width: anchor.width, height: anchor.height },
            viewport: { width: viewport.width, height: viewport.height },
          }
          : null,
      )
    }
    lynx
      .createSelectorQuery()
      .select(anchorSelector)
      .invoke({
        method: 'boundingClientRect',
        success: (res: unknown) => { anchor = res as RectResult; settle() },
        fail: () => { settle() },
      })
      .select(VIEWPORT_SELECTOR)
      .invoke({
        method: 'boundingClientRect',
        success: (res: unknown) => { viewport = res as RectResult; settle() },
        fail: () => { settle() },
      })
      .exec()
  } catch {
    // Hosts (and the Vitest env) without the invoke bridge throw rather than
    // report failure.
    deliver(null)
  }
}

/**
 * Where the panel goes when no measurement is available — no invoke bridge (unit
 * tests, or a host without `boundingClientRect`), or a selector that matched
 * nothing.
 *
 * Docked bottom-left rather than left at `0,0` or left to the stylesheet: a
 * `position: fixed` box with auto offsets resolves to its *static* position, which
 * for a panel declared beside a toolbar row is behind the page content — the exact
 * failure the backdrop rule in `PopoverMenu.css` documents. A visible, reachable
 * menu in a slightly odd place still works; an invisible one does not.
 */
export const DOCKED_POSITION: PanelPosition = {
  left: '16px',
  bottom: '16px',
  maxWidth: '260px',
  maxHeight: '60%',
}

let nextAnchorId = 0

export interface TapAnchor {
  /** Put on the trigger `<view>` so the measurement can address it. */
  anchorId: string
  /** `#`-prefixed form of {@link anchorId}. */
  anchorSelector: string
  /** Measure now; `done(null)` when there is nothing to measure with. */
  measure: (done: (result: AnchorMeasurement | null) => void) => void
}

/**
 * An anchor id for a trigger that is only ever measured **at tap time**.
 *
 * That is the right shape for a trigger inside a virtualized list, where measuring
 * on mount would be both wasteful and wrong: rows mount and recycle as the list
 * scrolls, so a mount-time rect is one scroll away from pointing at a different
 * song's row — and a few hundred rows would each dispatch a `SelectorQuery` nobody
 * asked for. The round trip is affordable here because there is no panel on screen
 * yet: nothing paints at the wrong place while the answer is in flight, unlike the
 * toolbar popovers (see {@link useAnchoredOverlay}).
 */
export function useTapAnchor(): TapAnchor {
  const idRef = useRef<string | null>(null)
  if (idRef.current == null) idRef.current = `popover-anchor-${nextAnchorId++}`
  const anchorId = idRef.current
  const anchorSelector = `#${anchorId}`

  const measure = useCallback(
    (done: (result: AnchorMeasurement | null) => void) => measureAnchor(anchorSelector, done),
    [anchorSelector],
  )

  return { anchorId, anchorSelector, measure }
}

export interface AnchoredOverlay {
  /** Put on the trigger `<view>` so the measurement can address it. */
  anchorId: string
  /** `#`-prefixed form of {@link anchorId}, for `measureAnchor`. */
  anchorSelector: string
  /**
   * Inline style for the panel — always complete, {@link DOCKED_POSITION} until the
   * first measurement lands. Never partial: see {@link PanelPosition}.
   */
  position: PanelPosition
  /** Re-measure. Call from the trigger's tap, before opening. */
  refresh: () => void
}

/**
 * Wires an id onto a trigger and keeps a measured panel position for it.
 *
 * **Measured on mount, and again on every open.** Both matter, for opposite
 * reasons. On mount, because the position has to be known *before* the first tap:
 * measurement is async, so a panel that only measures on open would paint once at
 * the fallback position and jump — and toolbars are laid out long before the user
 * reaches for them, so the mount measurement is almost always already correct. On
 * every open, because toolbars move (headers collapse, lists scroll) and a
 * mount-only rect is how a popover drifts away from its button over a session.
 *
 * One `SelectorQuery.exec` per open is cheap, and it replaces the library's
 * hardcoded 16-frame `DelayedEntering` wait before it would even *begin*
 * positioning.
 *
 * For a trigger that cannot be measured ahead of the tap — a row in a virtualized
 * list — use {@link useTapAnchor} and place the panel from the answer.
 *
 * `id` overrides the generated anchor id, for the rare owner that has to address
 * the same trigger itself (the player's overflow menu measures its own `⋯` again to
 * anchor the song menu it hands off to).
 */
export function useAnchoredOverlay(placement: Placement, id?: string): AnchoredOverlay {
  const generated = useTapAnchor()
  const anchorId = id ?? generated.anchorId
  const anchorSelector = id != null ? `#${id}` : generated.anchorSelector

  const [position, setPosition] = useState<PanelPosition>(DOCKED_POSITION)

  const refresh = useCallback(() => {
    measureAnchor(anchorSelector, (res) => {
      // A failed or absent measurement deliberately leaves the current position
      // alone: a slightly stale anchor beats a panel that jumps to the corner, and on
      // the very first open there is nothing to keep anyway (it is already docked).
      if (res == null) return
      setPosition(placePanel(res.anchor, res.viewport, placement))
    })
  }, [anchorSelector, placement])

  useEffect(refresh, [refresh])

  return { anchorId, anchorSelector, position, refresh }
}
