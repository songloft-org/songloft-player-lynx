import { EQ_GAIN_MAX, EQ_GAIN_MIN } from './eq-presets.js'

/**
 * Pure math for the vertical EQ band slider, kept free of Lynx/DOM so it can be
 * unit-tested. `EqualizerPage` wires these to touch events + the async
 * `boundingClientRect` measurement.
 *
 * Why a custom slider at all: Lynx's `<slider>` (and lynx-ui's Slider) is
 * horizontal-only, and rotating one with a CSS transform breaks its touch
 * handling. So each EQ band is a hand-rolled vertical drag surface.
 */

const GAIN_RANGE = EQ_GAIN_MAX - EQ_GAIN_MIN

/** Clamp to [0, 1]; anything non-finite collapses to 0 (a safe default). */
export function clamp01(v: number): number {
  return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0
}

/** Map a gain in dB to a 0..1 slider ratio. */
export function gainToSlider(db: number): number {
  return (db - EQ_GAIN_MIN) / GAIN_RANGE
}

/** Map a 0..1 slider ratio back to a gain in dB. */
export function sliderToGain(v: number): number {
  return v * GAIN_RANGE + EQ_GAIN_MIN
}

/**
 * Compute the 0..1 slider ratio from a touch Y coordinate.
 *
 * `top` / `height` describe the drag surface's bounding box **in the same
 * coordinate space as `y`** (both viewport-relative — see `touchYFromEvent` and
 * the `boundingClientRect` call in the component). The top of the track is max
 * gain (ratio 1) and the bottom is min gain (ratio 0), hence the `1 -`.
 *
 * Returns `null` when the inputs can't produce a meaningful ratio (unmeasured
 * track, non-finite touch), so the caller can simply skip the update.
 */
export function ratioFromY(y: number, top: number, height: number): number | null {
  if (!Number.isFinite(y) || !Number.isFinite(top) || !Number.isFinite(height) || height <= 0) {
    return null
  }
  return clamp01(1 - (y - top) / height)
}

/**
 * Extract the pointer Y coordinate from a Lynx touch **or mouse** event, picking
 * the field that lives in the same coordinate space as `boundingClientRect` on
 * the current platform:
 *
 * - **Web** (`isWeb`): `boundingClientRect` is browser-viewport-relative, so use
 *   `clientY` — top-level for mouse events, `touches[0].clientY` for touch.
 * - **Native**: `boundingClientRect` is LynxView-relative, and so is `detail.y`.
 *   Using `clientY` here instead is what made the thumb land "slightly off":
 *   `clientY` is display-area-relative and differs from the LynxView by the
 *   view's own offset (e.g. the status bar).
 *
 * Falls back through the remaining fields so a partially-populated event still
 * yields a usable coordinate; returns `NaN` if nothing is present.
 */
export function pointerYFromEvent(e: unknown, isWeb: boolean): number {
  const ev = e as {
    touches?: Array<{ clientY?: unknown }>
    changedTouches?: Array<{ clientY?: unknown }>
    detail?: { y?: unknown }
    clientY?: unknown
  } | null
  const touch = ev?.touches?.[0] ?? ev?.changedTouches?.[0]
  if (isWeb) {
    const topLevel = Number(ev?.clientY)
    if (Number.isFinite(topLevel)) return topLevel
    const touchClient = Number(touch?.clientY)
    if (Number.isFinite(touchClient)) return touchClient
    return Number(ev?.detail?.y)
  }
  const detail = Number(ev?.detail?.y)
  if (Number.isFinite(detail)) return detail
  return Number(touch?.clientY)
}
