import { afterEach, beforeEach, describe, expect, test } from 'vitest'

import {
  applySystemAppearance,
  setSystemAppearanceForTests,
} from '../../../native/system-appearance.js'
import { getReduceMotion, subscribeReduceMotion } from '../reduce-motion-model.js'

/**
 * `reduce-motion-model` re-exposes the host's `SystemAppearance.reduceMotion`
 * flag as a boolean + subscribe pair that `ThemeProvider` reads. The gate pins
 * the "host said nothing" default (motion ON, never a surprise motion-off) and
 * the subscribe contract that drives the `.reduce-motion` class re-render.
 */
afterEach(() => setSystemAppearanceForTests(null))

describe('reduce-motion model', () => {
  beforeEach(() => setSystemAppearanceForTests(null))

  test('defaults to motion-on when the host said nothing', () => {
    expect(getReduceMotion()).toBe(false)
  })

  test('a host true resolves to motion-off', () => {
    applySystemAppearance({ theme: null, locale: null, reduceMotion: true })
    expect(getReduceMotion()).toBe(true)
  })

  test('a host false resolves to motion-on', () => {
    applySystemAppearance({ theme: null, locale: null, reduceMotion: false })
    expect(getReduceMotion()).toBe(false)
  })

  test('subscribers fire when the flag flips, and not when it does not', () => {
    let calls = 0
    const unsub = subscribeReduceMotion(() => { calls++ })
    applySystemAppearance({ theme: null, locale: null, reduceMotion: true })
    expect(calls).toBe(1)
    // Same value → applySystemAppearance no-ops → no notify.
    applySystemAppearance({ theme: null, locale: null, reduceMotion: true })
    expect(calls).toBe(1)
    applySystemAppearance({ theme: null, locale: null, reduceMotion: false })
    expect(calls).toBe(2)
    unsub()
    applySystemAppearance({ theme: null, locale: null, reduceMotion: true })
    expect(calls).toBe(2) // unsubscribed
  })
})
