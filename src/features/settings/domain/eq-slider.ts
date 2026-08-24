import { EQ_GAIN_MAX, EQ_GAIN_MIN } from './eq-presets.js'

/**
 * Gain ↔ slider-ratio mapping for the EQ bands, kept free of Lynx/DOM so it can be
 * unit-tested. `EqualizerPage` feeds these to the shared `VerticalSlider`.
 *
 * The drag maths itself (pointer coordinate → 0..1 ratio) is **not** here: it is
 * `shared/ui/vertical-slider.ts`, shared with the player's volume popover. This
 * module owns only the part that is about decibels.
 */

const GAIN_RANGE = EQ_GAIN_MAX - EQ_GAIN_MIN

/** Map a gain in dB to a 0..1 slider ratio. */
export function gainToSlider(db: number): number {
  return (db - EQ_GAIN_MIN) / GAIN_RANGE
}

/** Map a 0..1 slider ratio back to a gain in dB. */
export function sliderToGain(v: number): number {
  return v * GAIN_RANGE + EQ_GAIN_MIN
}
