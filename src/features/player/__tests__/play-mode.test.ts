import { describe, expect, test } from 'vitest'

import {
  cyclePlayMode,
  hasNextForMode,
  hasPrevForMode,
  resolveNext,
  resolvePrev,
  resolveStartIndex,
} from '../domain/play-mode.js'

describe('resolveNext', () => {
  test('order advances then stops (null) at the end', () => {
    expect(resolveNext('order', 0, 3)).toBe(1)
    expect(resolveNext('order', 1, 3)).toBe(2)
    expect(resolveNext('order', 2, 3)).toBeNull()
  })

  test('loop wraps around', () => {
    expect(resolveNext('loop', 2, 3)).toBe(0)
    expect(resolveNext('loop', 0, 3)).toBe(1)
  })

  test('single stays on the current index', () => {
    expect(resolveNext('single', 1, 3)).toBe(1)
  })

  test('random stays in range and avoids an immediate repeat', () => {
    // rng → 1 would pick the current index (1); expect it to shift off.
    expect(resolveNext('random', 1, 3, () => 1 / 3)).not.toBe(1)
    const idx = resolveNext('random', 0, 5, () => 0.99)
    expect(idx).toBeGreaterThanOrEqual(0)
    expect(idx).toBeLessThan(5)
  })

  test('single-element random returns 0', () => {
    expect(resolveNext('random', 0, 1, () => 0.5)).toBe(0)
  })

  test('empty queue returns null', () => {
    expect(resolveNext('order', 0, 0)).toBeNull()
    expect(resolveNext('loop', 0, 0)).toBeNull()
  })
})

describe('resolvePrev', () => {
  test('order goes back then stops (null) at the start', () => {
    expect(resolvePrev('order', 2, 3)).toBe(1)
    expect(resolvePrev('order', 0, 3)).toBeNull()
  })

  test('loop wraps to the last index', () => {
    expect(resolvePrev('loop', 0, 3)).toBe(2)
  })

  test('single stays put', () => {
    expect(resolvePrev('single', 2, 3)).toBe(2)
  })
})

describe('hasNext / hasPrev', () => {
  test('loop/random always have both', () => {
    expect(hasNextForMode('loop', 2, 3)).toBe(true)
    expect(hasPrevForMode('random', 0, 3)).toBe(true)
  })

  test('order/single are bounded by the index', () => {
    expect(hasNextForMode('order', 2, 3)).toBe(false)
    expect(hasNextForMode('order', 1, 3)).toBe(true)
    expect(hasPrevForMode('single', 0, 3)).toBe(false)
    expect(hasPrevForMode('single', 1, 3)).toBe(true)
  })

  test('empty queue has neither', () => {
    expect(hasNextForMode('loop', 0, 0)).toBe(false)
    expect(hasPrevForMode('loop', 0, 0)).toBe(false)
  })
})

describe('resolveStartIndex', () => {
  test('non-random modes always start at 0', () => {
    expect(resolveStartIndex('order', 5)).toBe(0)
    expect(resolveStartIndex('loop', 5)).toBe(0)
    expect(resolveStartIndex('single', 5)).toBe(0)
  })

  test('random picks an in-range index from the rng', () => {
    // rng → 0.5 over 5 tracks → floor(2.5) = 2.
    expect(resolveStartIndex('random', 5, () => 0.5)).toBe(2)
    // rng → 0.99 must clamp inside the queue, never reach length.
    expect(resolveStartIndex('random', 5, () => 0.99)).toBe(4)
    // rng → 0 starts at the first track.
    expect(resolveStartIndex('random', 5, () => 0)).toBe(0)
  })

  test('random with a single or empty queue returns 0', () => {
    expect(resolveStartIndex('random', 1, () => 0.5)).toBe(0)
    expect(resolveStartIndex('random', 0, () => 0.5)).toBe(0)
  })
})

test('cyclePlayMode rotates order → loop → single → random → order', () => {
  expect(cyclePlayMode('order')).toBe('loop')
  expect(cyclePlayMode('loop')).toBe('single')
  expect(cyclePlayMode('single')).toBe('random')
  expect(cyclePlayMode('random')).toBe('order')
})
