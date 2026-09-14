import { describe, expect, test } from 'vitest'

import { clamp01, pointerXFromEvent, ratioFromX } from '../horizontal-slider.js'

describe('ratioFromX', () => {
  const LEFT = 20
  const WIDTH = 200

  test('left edge is 0, right edge is 1', () => {
    expect(ratioFromX(LEFT, LEFT, WIDTH)).toBe(0)
    expect(ratioFromX(LEFT + WIDTH, LEFT, WIDTH)).toBe(1)
  })

  test('midpoint is 0.5, quarter is 0.25', () => {
    expect(ratioFromX(LEFT + WIDTH / 2, LEFT, WIDTH)).toBeCloseTo(0.5)
    expect(ratioFromX(LEFT + WIDTH * 0.25, LEFT, WIDTH)).toBeCloseTo(0.25)
  })

  test('clamps beyond the ends', () => {
    expect(ratioFromX(LEFT - 40, LEFT, WIDTH)).toBe(0)
    expect(ratioFromX(LEFT + WIDTH + 40, LEFT, WIDTH)).toBe(1)
  })

  test('ignores the absolute offset (scroll-independent)', () => {
    expect(ratioFromX(-50 + WIDTH / 2, -50, WIDTH)).toBeCloseTo(0.5)
  })

  test('returns null for degenerate or non-finite inputs', () => {
    expect(ratioFromX(100, LEFT, 0)).toBeNull()
    expect(ratioFromX(100, Number.NaN, WIDTH)).toBeNull()
    expect(ratioFromX(Number.NaN, LEFT, WIDTH)).toBeNull()
  })
})

describe('pointerXFromEvent', () => {
  test('web prefers clientX', () => {
    expect(pointerXFromEvent({ clientX: 42, detail: { x: 7 } }, true)).toBe(42)
    expect(pointerXFromEvent({ touches: [{ clientX: 13 }], detail: { x: 999 } }, true)).toBe(13)
  })

  test('native prefers detail.x', () => {
    expect(pointerXFromEvent({ detail: { x: 30 }, touches: [{ clientX: 88 }], clientX: 88 }, false)).toBe(30)
    expect(pointerXFromEvent({ touches: [{ clientX: 55 }] }, false)).toBe(55)
  })

  test('malformed events yield NaN', () => {
    expect(Number.isNaN(pointerXFromEvent({}, true))).toBe(true)
    expect(Number.isNaN(pointerXFromEvent(null, false))).toBe(true)
  })
})

describe('clamp01', () => {
  test('clamps and collapses non-finite', () => {
    expect(clamp01(-0.2)).toBe(0)
    expect(clamp01(1.2)).toBe(1)
    expect(clamp01(Number.NaN)).toBe(0)
  })
})