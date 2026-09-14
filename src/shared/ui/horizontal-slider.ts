/**
 * Pure math for a horizontal drag surface, the mirror of `vertical-slider.ts`
 * so the full-video seek bar doesn't have to inline coordinate handling.
 */

/** Clamp to [0, 1]; anything non-finite collapses to 0. */
export function clamp01(v: number): number {
  return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0
}

/** Compute the 0..1 ratio from a pointer X (left is 0, right is 1). */
export function ratioFromX(x: number, left: number, width: number): number | null {
  if (!Number.isFinite(x) || !Number.isFinite(left) || !Number.isFinite(width) || width <= 0) {
    return null
  }
  return clamp01((x - left) / width)
}

/**
 * Extract the pointer X coordinate from a Lynx touch or mouse event, picking the
 * field that matches `boundingClientRect`'s space per platform (see
 * `pointerYFromEvent` in `vertical-slider.ts` for the same reasoning).
 */
export function pointerXFromEvent(e: unknown, isWeb: boolean): number {
  const ev = e as {
    touches?: Array<{ clientX?: unknown }>
    changedTouches?: Array<{ clientX?: unknown }>
    detail?: { x?: unknown }
    clientX?: unknown
  } | null
  const touch = ev?.touches?.[0] ?? ev?.changedTouches?.[0]
  if (isWeb) {
    const topLevel = Number(ev?.clientX)
    if (Number.isFinite(topLevel)) return topLevel
    const touchClient = Number(touch?.clientX)
    if (Number.isFinite(touchClient)) return touchClient
    return Number(ev?.detail?.x)
  }
  const detail = Number(ev?.detail?.x)
  if (Number.isFinite(detail)) return detail
  return Number(touch?.clientX)
}