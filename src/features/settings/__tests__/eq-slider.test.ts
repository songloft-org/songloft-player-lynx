import { describe, expect, test } from 'vitest'

import {
  clamp01,
  gainToSlider,
  pointerYFromEvent,
  ratioFromY,
  sliderToGain,
} from '../domain/eq-slider.js'
import { EQ_GAIN_MAX, EQ_GAIN_MIN } from '../domain/eq-presets.js'

/*
 * These pin the math behind the vertical EQ band slider. The on-device bug was
 * "the slider can't be dragged": the old component measured the track with a
 * synchronous `getBoundingClientRect()` that Lynx refs don't have, so every drag
 * produced NaN. The fix measures asynchronously and feeds the touch Y through
 * `ratioFromY`/`touchYFromEvent` — these tests lock that math, including the
 * direction (top = max gain) and the scroll-independence that comes from using
 * viewport-relative coordinates on both sides.
 */

describe('clamp01', () => {
  test('values inside [0, 1] pass through', () => {
    expect(clamp01(0)).toBe(0)
    expect(clamp01(0.5)).toBe(0.5)
    expect(clamp01(1)).toBe(1)
  })

  test('values outside are clamped', () => {
    expect(clamp01(-0.5)).toBe(0)
    expect(clamp01(1.5)).toBe(1)
  })

  test('non-finite input collapses to 0', () => {
    expect(clamp01(Number.NaN)).toBe(0)
    expect(clamp01(Number.POSITIVE_INFINITY)).toBe(0)
  })
})

describe('gainToSlider / sliderToGain', () => {
  test('min gain maps to 0, max gain maps to 1', () => {
    expect(gainToSlider(EQ_GAIN_MIN)).toBe(0)
    expect(gainToSlider(EQ_GAIN_MAX)).toBe(1)
  })

  test('0 dB maps to the midpoint', () => {
    expect(gainToSlider(0)).toBeCloseTo(0.5)
  })

  test('round-trips within the range', () => {
    for (const db of [EQ_GAIN_MIN, -6, 0, 3, EQ_GAIN_MAX]) {
      expect(sliderToGain(gainToSlider(db))).toBeCloseTo(db)
    }
  })
})

describe('ratioFromY', () => {
  // A track whose top is at y=100 and is 200px tall.
  const TOP = 100
  const HEIGHT = 200

  test('top of the track is max (ratio 1), bottom is min (ratio 0)', () => {
    expect(ratioFromY(TOP, TOP, HEIGHT)).toBe(1)
    expect(ratioFromY(TOP + HEIGHT, TOP, HEIGHT)).toBe(0)
  })

  test('midpoint is 0.5', () => {
    expect(ratioFromY(TOP + HEIGHT / 2, TOP, HEIGHT)).toBeCloseTo(0.5)
  })

  test('a quarter from the top is 0.75', () => {
    expect(ratioFromY(TOP + HEIGHT * 0.25, TOP, HEIGHT)).toBeCloseTo(0.75)
  })

  test('drags beyond the ends clamp to [0, 1]', () => {
    expect(ratioFromY(TOP - 50, TOP, HEIGHT)).toBe(1)
    expect(ratioFromY(TOP + HEIGHT + 50, TOP, HEIGHT)).toBe(0)
  })

  test('works when the track has scrolled (non-zero/negative top)', () => {
    // Scrolling the page down moves the track up: its viewport-relative top can
    // even go negative. The ratio must depend only on (y - top), not on top
    // being a "nice" value.
    expect(ratioFromY(-50 + HEIGHT / 2, -50, HEIGHT)).toBeCloseTo(0.5)
    expect(ratioFromY(0, -50, HEIGHT)).toBeCloseTo(1 - 50 / HEIGHT)
  })

  test('returns null for an unmeasured or degenerate track', () => {
    expect(ratioFromY(150, TOP, 0)).toBeNull()
    expect(ratioFromY(150, TOP, -10)).toBeNull()
    expect(ratioFromY(150, Number.NaN, HEIGHT)).toBeNull()
  })

  test('returns null for a non-finite touch', () => {
    expect(ratioFromY(Number.NaN, TOP, HEIGHT)).toBeNull()
  })
})

describe('pointerYFromEvent', () => {
  describe('web (isWeb = true): prefers clientY to match the browser-viewport rect', () => {
    test('mouse event: top-level clientY wins over detail.y', () => {
      const e = { clientY: 42, detail: { y: 7 } }
      expect(pointerYFromEvent(e, true)).toBe(42)
    })

    test('touch event: touches[0].clientY is used when there is no top-level clientY', () => {
      const e = { touches: [{ clientY: 13 }], detail: { y: 999 } }
      expect(pointerYFromEvent(e, true)).toBe(13)
    })

    test('falls back to detail.y when no clientY is present', () => {
      const e = { touches: [{ y: 5 }], detail: { y: 77 } }
      expect(pointerYFromEvent(e, true)).toBe(77)
    })
  })

  describe('native (isWeb = false): prefers detail.y to match the LynxView-relative rect', () => {
    test('detail.y wins over clientY (clientY is display-area-relative and offsets the thumb)', () => {
      const e = { detail: { y: 30 }, touches: [{ clientY: 88 }], clientY: 88 }
      expect(pointerYFromEvent(e, false)).toBe(30)
    })

    test('falls back to touches[0].clientY when detail.y is missing', () => {
      const e = { touches: [{ clientY: 55 }] }
      expect(pointerYFromEvent(e, false)).toBe(55)
    })
  })

  test('returns NaN for an empty/malformed event', () => {
    expect(Number.isNaN(pointerYFromEvent({}, true))).toBe(true)
    expect(Number.isNaN(pointerYFromEvent(null, false))).toBe(true)
  })
})
