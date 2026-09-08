import { afterEach, expect, test } from 'vitest'

import {
  applySafeAreaInsets,
  coerceSafeAreaEdge,
  getSafeAreaInsets,
  GLOBAL_PROP_SAFE_BOTTOM,
  GLOBAL_PROP_SAFE_LEFT,
  GLOBAL_PROP_SAFE_RIGHT,
  GLOBAL_PROP_SAFE_TOP,
  parseSafeAreaInsets,
  resolveInsetsForPlatform,
  safeAreaStyleVars,
  setSafeAreaForTests,
  subscribeSafeArea,
} from '../safe-area.js'

/**
 * The decoding half of the safe-area channel. The delivery half needs a device
 * (`e2e/scenarios/ios-safe-area.scenario.ts`); everything here is the part that can
 * be wrong without a device — and the part where being wrong is invisible, because
 * every failure mode produces "no inset", which looks exactly like a phone without a
 * notch.
 */

afterEach(() => {
  setSafeAreaForTests(null)
})

test('a full host payload decodes to four numbers', () => {
  expect(parseSafeAreaInsets({
    [GLOBAL_PROP_SAFE_TOP]: 62,
    [GLOBAL_PROP_SAFE_BOTTOM]: 34,
    [GLOBAL_PROP_SAFE_LEFT]: 0,
    [GLOBAL_PROP_SAFE_RIGHT]: 0,
  })).toEqual({ top: 62, bottom: 34, left: 0, right: 0 })
})

test('an absent payload decodes to all-null, not all-zero', () => {
  // The distinction is the whole design: `null` leaves the stylesheet's `env()`
  // default in place (correct on Web), `0` would override it with a zero and put
  // the Web build's content back under the notch.
  expect(parseSafeAreaInsets(undefined)).toEqual({
    top: null, bottom: null, left: null, right: null,
  })
  expect(parseSafeAreaInsets({})).toEqual({
    top: null, bottom: null, left: null, right: null,
  })
})

test('0 is a value, not a missing edge', () => {
  // Every device without a notch reports 0 for top, and every portrait phone reports
  // 0 for left/right. Coercing those to `null` would be indistinguishable from a
  // broken host and would silently hand the edge back to `env()`.
  expect(coerceSafeAreaEdge(0)).toBe(0)
  expect(safeAreaStyleVars({ top: 0, bottom: 0, left: 0, right: 0 })).toEqual({
    '--safe-top': '0px',
    '--safe-bottom': '0px',
    '--safe-left': '0px',
    '--safe-right': '0px',
  })
})

test.each([
  ['a string', '62'],
  ['a px string', '62px'],
  ['null', null],
  ['undefined', undefined],
  ['NaN', Number.NaN],
  ['Infinity', Number.POSITIVE_INFINITY],
  ['a negative inset', -8],
  ['an object', {}],
])('%s is rejected', (_label, raw) => {
  expect(coerceSafeAreaEdge(raw)).toBeNull()
})

test('only reported edges become style vars', () => {
  // A partial payload must leave the unreported edges to `env()`. Emitting them as
  // `0px` is the bug this asserts against: it would look identical on iOS (where
  // `env()` is 0 anyway) and break Web, where `env()` is the only thing that works.
  expect(safeAreaStyleVars({ top: 62, bottom: null, left: null, right: null }))
    .toEqual({ '--safe-top': '62px' })
  expect(safeAreaStyleVars({ top: null, bottom: null, left: null, right: null }))
    .toEqual({})
})

test('native hosts pin unreported edges to 0 instead of leaving them to env()', () => {
  // Android/HarmonyOS never push insets, and their `env()` inside a custom-property
  // value is invalid (like iOS) — so an unreported edge must become an inline
  // `0px`, not a fall-through to the broken stylesheet default.
  expect(resolveInsetsForPlatform(
    { top: null, bottom: null, left: null, right: null },
    true,
  )).toEqual({ top: 0, bottom: 0, left: 0, right: 0 })
  expect(resolveInsetsForPlatform(
    { top: 62, bottom: null, left: 0, right: null },
    true,
  )).toEqual({ top: 62, bottom: 0, left: 0, right: 0 })
})

test('web and unknown hosts keep unreported edges null so the stylesheet env() default stands', () => {
  expect(resolveInsetsForPlatform(
    { top: null, bottom: null, left: null, right: null },
    false,
  )).toEqual({ top: null, bottom: null, left: null, right: null })
  expect(resolveInsetsForPlatform(
    { top: 62, bottom: null, left: null, right: null },
    false,
  )).toEqual({ top: 62, bottom: null, left: null, right: null })
})

test('a host push notifies subscribers only when something moved', () => {
  setSafeAreaForTests({ top: 62, bottom: 34, left: 0, right: 0 })
  let calls = 0
  const unsubscribe = subscribeSafeArea(() => { calls += 1 })

  // Same values — a no-op. This matters because the iOS host calls its push from
  // `viewDidLayoutSubviews`, which fires far more often than the insets change, and
  // each delivery re-renders the theme root.
  applySafeAreaInsets({ top: 62, bottom: 34, left: 0, right: 0 })
  expect(calls).toBe(0)

  // Rotation: the notch moves to a side.
  applySafeAreaInsets({ top: 0, bottom: 21, left: 62, right: 62 })
  expect(calls).toBe(1)
  expect(getSafeAreaInsets()).toEqual({ top: 0, bottom: 21, left: 62, right: 62 })

  unsubscribe()
  applySafeAreaInsets({ top: 62, bottom: 34, left: 0, right: 0 })
  expect(calls).toBe(1)
})
