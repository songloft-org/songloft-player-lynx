import { beforeEach, expect, test } from 'vitest'

import { clearScrollMemory, getScrollOffset, setScrollOffset } from '../scroll-memory.js'

beforeEach(() => clearScrollMemory())

test('an unvisited page starts at the top', () => {
  expect(getScrollOffset('settings')).toBe(0)
})

test('the offset survives the read/write round trip', () => {
  setScrollOffset('settings', 428)
  expect(getScrollOffset('settings')).toBe(428)
})

test('keys are independent, so one page cannot restore into another', () => {
  setScrollOffset('settings', 428)
  setScrollOffset('library', 96)
  expect(getScrollOffset('settings')).toBe(428)
  expect(getScrollOffset('library')).toBe(96)
})

test('the latest write wins', () => {
  setScrollOffset('settings', 428)
  setScrollOffset('settings', 12)
  expect(getScrollOffset('settings')).toBe(12)
})

test("iOS's negative over-scroll offset is clamped, not stored", () => {
  // `bounces` reports a negative `scrollTop` while the top spring is stretched.
  // Storing it would restore the page inside the bounce region.
  setScrollOffset('settings', -64)
  expect(getScrollOffset('settings')).toBe(0)
})

test('clearing resets every key', () => {
  setScrollOffset('settings', 428)
  setScrollOffset('library', 96)
  clearScrollMemory()
  expect(getScrollOffset('settings')).toBe(0)
  expect(getScrollOffset('library')).toBe(0)
})
