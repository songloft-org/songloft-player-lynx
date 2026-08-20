import { describe, expect, test } from 'vitest'

import {
  MIN_COVER,
  PLAYER_METRICS,
  fitCover,
  resolvePlayerLayout,
} from '../domain/player-layout.js'
import { type Breakpoint } from '../../../shared/responsive/useBreakpoint.js'

/**
 * The player's size table, asserted directly.
 *
 * These numbers exist only in JS (this repo has no `@media` and bans viewport units),
 * so nothing but a test looks at them. And a wrong one is invisible in review: a
 * screenshot of the tablet layout with the desktop's 300px cover looks like a
 * perfectly reasonable tablet layout. Hence the values are spelled out rather than
 * read back from the table.
 */

/** A stage tall enough that the height budget never binds; isolates the table lookup. */
const TALL = 2000

describe('the size table matches the Flutter reference', () => {
  test.each([
    // breakpoint,  padH, cover, playBtn, playRadius, toolSlot
    ['tablet' as const, 24, 220, 52, 26, 48],
    ['desktop' as const, 48, 300, 52, 26, 48],
    ['tv' as const, 64, 420, 64, 32, 56],
  ])('%s: padding %i, cover %i, play %i/r%i, slot %i',
    (breakpoint, padH, cover, playBtn, playRadius, toolSlot) => {
      const l = resolvePlayerLayout({ width: 1000, height: TALL, breakpoint })
      expect(l.padH).toBe(padH)
      expect(l.coverSize).toBe(cover)
      expect(l.playBtn).toBe(playBtn)
      expect(l.playRadius).toBe(playRadius)
      expect(l.toolSlot).toBe(toolSlot)
    })

  test('mobile derives the cover from the width (Flutter: screenWidth * 0.75)', () => {
    expect(resolvePlayerLayout({ width: 400, height: TALL, breakpoint: 'mobile' }).coverSize)
      .toBe(300)
    expect(resolvePlayerLayout({ width: 320, height: TALL, breakpoint: 'mobile' }).coverSize)
      .toBe(240)
  })

  test('mobile is the only class with a ratio, the rest are fixed px', () => {
    // Guards the two-field encoding: a row with both, or neither, would silently
    // pick one path and look plausible.
    for (const [name, m] of Object.entries(PLAYER_METRICS)) {
      const hasRatio = m.coverRatio != null
      const hasPx = m.coverPx != null
      expect(hasRatio !== hasPx, `${name} must set exactly one of coverRatio/coverPx`).toBe(true)
      expect(hasRatio).toBe(name === 'mobile')
    }
  })

  test('only mobile uses a rounded rect; wide classes are circles', () => {
    // Flutter passes `useRoundedRect: true` for mobile's 76px button and leaves the
    // desktop's 52px one circular. Radius == half the edge is what makes a circle.
    expect(PLAYER_METRICS.mobile.playRadius).toBeLessThan(PLAYER_METRICS.mobile.playBtn / 2)
    for (const name of ['tablet', 'desktop', 'tv'] as const) {
      const m = PLAYER_METRICS[name]
      expect(m.playRadius, `${name} should be a circle`).toBe(m.playBtn / 2)
    }
  })
})

/**
 * The height budget (Flutter `desktop_full_player.dart:270-273`).
 *
 * This is the half that stops the layout overflowing on a phone in landscape or a
 * half-height desktop window. Overflow in Lynx is not an error — the bottom controls
 * are simply clipped away, which reads as "the play button is missing".
 */
describe('the cover shrinks to fit the available height', () => {
  test('a short stage shrinks the cover below the table value', () => {
    // 300 - chromeH(32) - margin(16) = 252
    expect(resolvePlayerLayout({ width: 1000, height: 300, breakpoint: 'desktop' }).coverSize)
      .toBe(252)
  })

  test('an extremely short stage stops at the floor, never at zero or below', () => {
    const l = resolvePlayerLayout({ width: 1000, height: 120, breakpoint: 'desktop' })
    expect(l.coverSize).toBe(MIN_COVER)
    expect(l.coverSize).toBeGreaterThan(0)
  })

  test('the floor wins even when the budget goes negative', () => {
    expect(fitCover(300, 40, 32)).toBe(MIN_COVER)
    expect(fitCover(300, 0, 32)).toBe(MIN_COVER)
  })

  test('a tall stage leaves the table value untouched', () => {
    expect(fitCover(300, TALL, 32)).toBe(300)
  })

  test('mobile is fitted too, not just the wide classes', () => {
    // 500 * 0.75 = 375 desired, but only 180 - 32 - 16 = 132 → floor.
    expect(resolvePlayerLayout({ width: 500, height: 180, breakpoint: 'mobile' }).coverSize)
      .toBe(MIN_COVER)
  })

  test('tv reserves more stage padding than the other classes', () => {
    // Its wrapper padding is roomier, so the same stage height leaves less for the
    // cover. Encoded as a table field precisely so this can differ per class.
    expect(PLAYER_METRICS.tv.chromeH).toBeGreaterThan(PLAYER_METRICS.desktop.chromeH)
  })
})

describe('split vs single column', () => {
  test.each(['tablet', 'desktop', 'tv'] as const)('%s splits cover and lyrics 4:5', (bp) => {
    const l = resolvePlayerLayout({ width: 1000, height: TALL, breakpoint: bp })
    expect(l.isSplit).toBe(true)
    expect([l.coverFlex, l.lyricsFlex]).toEqual([4, 5])
  })

  test('mobile does not split', () => {
    expect(resolvePlayerLayout({ width: 400, height: TALL, breakpoint: 'mobile' }).isSplit)
      .toBe(false)
  })
})

/**
 * Before measurement.
 *
 * `/player` mounts on navigation, so on Web the first frame genuinely has no
 * dimensions (see `useBreakpoint`). What matters is that this state is *reported*
 * rather than papered over — the caller has to withhold the `Swiper`, which caches
 * whatever `itemWidth` it is first handed.
 */
describe('unmeasured containers', () => {
  test.each([
    ['no width', { width: 0, height: 800 }],
    ['no height', { width: 1200, height: 0 }],
    ['neither', { width: 0, height: 0 }],
  ])('%s reports measured: false and falls back to mobile', (_label, dims) => {
    const l = resolvePlayerLayout({ ...dims, breakpoint: 'desktop' })
    expect(l.measured).toBe(false)
    expect(l.padH).toBe(PLAYER_METRICS.mobile.padH)
    expect(l.playBtn).toBe(PLAYER_METRICS.mobile.playBtn)
    // Never splits unmeasured: the split branch has no fallback for a 0-width column.
    expect(l.isSplit).toBe(false)
  })

  test('an unmeasured cover is the floor, not zero', () => {
    // A 0-sized cover would render as nothing at all, which looks like a load failure
    // rather than a layout that has not settled yet.
    expect(resolvePlayerLayout({ width: 0, height: 0, breakpoint: 'mobile' }).coverSize)
      .toBe(MIN_COVER)
  })

  test('measured turns true as soon as both dimensions arrive', () => {
    const l = resolvePlayerLayout({ width: 1200, height: 800, breakpoint: 'desktop' })
    expect(l.measured).toBe(true)
    expect(l.isSplit).toBe(true)
  })
})

test('every breakpoint has a row', () => {
  // `Breakpoint` is a union; a new member added to it without a row here would be a
  // `undefined` spread and every size would silently become NaN.
  const all: Breakpoint[] = ['mobile', 'tablet', 'desktop', 'tv']
  for (const bp of all) {
    const l = resolvePlayerLayout({ width: 1000, height: TALL, breakpoint: bp })
    for (const [key, value] of Object.entries(l)) {
      if (typeof value === 'number') {
        expect(Number.isFinite(value), `${bp}.${key} is not a finite number`).toBe(true)
      }
    }
  }
})
