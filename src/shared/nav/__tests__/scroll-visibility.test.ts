import { afterEach, describe, expect, test } from 'vitest'

import {
  SCROLL_EDGE_THRESHOLD,
  clearScrollVisibility,
  getIsScrolled,
  reportScrollOffset,
  setIsScrolled,
  subscribeIsScrolled,
} from '../scroll-visibility.js'

/**
 * Scroll-edge signal gate. The store is a single boolean crossing the layer
 * boundary between a page's scroller and the shell's floating capsule, so the
 * things worth pinning are the collapse-to-boolean (a render storm must not
 * become a publish storm), the no-op on no-change, and the subscribe contract
 * `useSyncExternalStore` reads.
 */
afterEach(() => clearScrollVisibility())

describe('scroll-visibility store', () => {
  test('starts unscrolled', () => {
    expect(getIsScrolled()).toBe(false)
  })

  test('reportScrollOffset collapses the offset to the boolean at the threshold', () => {
    reportScrollOffset(0)
    expect(getIsScrolled()).toBe(false)
    reportScrollOffset(SCROLL_EDGE_THRESHOLD)
    expect(getIsScrolled()).toBe(false)
    reportScrollOffset(SCROLL_EDGE_THRESHOLD + 1)
    expect(getIsScrolled()).toBe(true)
    reportScrollOffset(0)
    expect(getIsScrolled()).toBe(false)
  })

  test('setIsScrolled is a no-op on no change, so a bindscroll storm does not republish', () => {
    let calls = 0
    const unsub = subscribeIsScrolled(() => { calls++ })
    setIsScrolled(true)
    setIsScrolled(true)
    setIsScrolled(true)
    expect(getIsScrolled()).toBe(true)
    expect(calls).toBe(1)
    setIsScrolled(false)
    expect(calls).toBe(2)
    unsub()
  })

  test('subscribe returns an unsubscribe that stops notifications', () => {
    const unsub = subscribeIsScrolled(() => {
      throw new Error('listener fired after unsubscribe')
    })
    unsub()
    setIsScrolled(true)
    // no throw
    expect(getIsScrolled()).toBe(true)
  })

  test('clearScrollVisibility resets to false and notifies', () => {
    setIsScrolled(true)
    let calls = 0
    subscribeIsScrolled(() => { calls++ })
    clearScrollVisibility()
    expect(getIsScrolled()).toBe(false)
    expect(calls).toBe(1)
  })
})
