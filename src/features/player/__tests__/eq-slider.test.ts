import { describe, expect, test } from 'vitest'

import { gainToSlider, sliderToGain } from '../domain/eq-slider.js'
import { EQ_GAIN_MAX, EQ_GAIN_MIN } from '../domain/eq-presets.js'

/*
 * The dB ↔ ratio mapping the EQ bands hand to the shared vertical slider. The drag
 * math those ratios come from is pinned separately, in
 * `shared/ui/__tests__/vertical-slider.test.ts`.
 */

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
