import { describe, expect, test } from 'vitest'

import { DOCKED_POSITION, placePanel } from '../anchored-overlay.js'
import type { AnchorRect } from '../anchored-overlay.js'

/**
 * The placement math, tested against the rects actually measured in the browser
 * before the rewrite — so each case names the popover it belongs to and the wrong
 * answer lynx-ui-popover gave for it.
 *
 * Every assertion here is about *edges*, never about a corner: `placePanel` must
 * never need the panel's own width or height (see the module header). The two
 * `toBeUndefined` checks are therefore not padding — a second offset on either axis
 * would stretch a `position: fixed` box between them instead of sizing it.
 */

const VIEWPORT = { width: 420, height: 900 }

/** The trigger rects measured in Chrome at 420×900, standalone Web build. */
const ANCHORS = {
  librarySort: { left: 106, top: 165, width: 82, height: 26 },
  playlistDetailSort: { left: 280, top: 237, width: 58, height: 26 },
  playerMore: { left: 364, top: 16, width: 40, height: 40 },
  playerVolume: { left: 57, top: 836, width: 48, height: 48 },
  playerSpeed: { left: 186, top: 836, width: 48, height: 48 },
  playMode: { left: 16, top: 758, width: 48, height: 48 },
} satisfies Record<string, AnchorRect>

describe('horizontal anchoring', () => {
  test('bottom-start pins the panel to the trigger\'s left edge', () => {
    // Library sort chip. lynx-ui put this at left: 0 — the row's origin, not the
    // chip's — because its coordinates are trigger-relative but applied against the
    // nearest positioned ancestor.
    const pos = placePanel(ANCHORS.librarySort, VIEWPORT, 'bottom-start')
    expect(pos.left).toBe('106px')
    expect(pos.right).toBeUndefined()
  })

  test('bottom-end pins the panel to the trigger\'s right edge', () => {
    // Playlist detail sort chip: right edge at 280 + 58 = 338, so 420 - 338 = 82
    // from the viewport's right. lynx-ui put it at left: -122 — entirely off-screen,
    // which made the sort menu unreachable.
    const pos = placePanel(ANCHORS.playlistDetailSort, VIEWPORT, 'bottom-end')
    expect(pos.right).toBe('82px')
    expect(pos.left).toBeUndefined()
  })

  test('an un-aligned placement picks the side with more room', () => {
    // True centering would need the panel's width, the one input this module
    // refuses to depend on. Both call sites that pass an un-aligned placement were
    // off-screen before: volume at x = -60, speed at x = -30.
    const volume = placePanel(ANCHORS.playerVolume, VIEWPORT, 'top')
    expect(volume.left).toBe('57px') // centre 81 < 210 ⇒ open rightwards
    const nearRight = placePanel({ left: 340, top: 400, width: 40, height: 40 }, VIEWPORT, 'bottom')
    expect(nearRight.right).toBe('40px') // centre 360 > 210 ⇒ open leftwards
    expect(nearRight.left).toBeUndefined()
  })

  /**
   * `max-width` alone cannot keep a panel on screen: CSS resolves `min-width`
   * *after* it, so `.popover-menu--wide`'s `min-width: 180px` beats any smaller cap
   * computed here. The offset therefore has to reserve the room itself.
   */
  test('a cramped anchor drags the panel back on screen rather than off it', () => {
    // Right-edge trigger opening rightwards (a wide-layout row tail).
    const start = placePanel({ left: 418, top: 100, width: 2, height: 20 }, VIEWPORT, 'bottom-start')
    expect(Number.parseFloat(start.left!)).toBe(212) // 420 - 8 - 200
    // Left-edge trigger opening leftwards: the mirror case, and the one that made
    // the playlist detail sort menu unreachable at x = -122.
    const end = placePanel({ left: 4, top: 100, width: 40, height: 20 }, VIEWPORT, 'bottom-end')
    expect(Number.parseFloat(end.right!)).toBe(212)
  })

  test('a roomy anchor is not dragged at all', () => {
    // The clamp must only bite when it has to, or every menu would drift off its
    // button. The player's overflow menu sits 16px from the right edge.
    const pos = placePanel(ANCHORS.playerMore, VIEWPORT, 'bottom-end')
    expect(pos.right).toBe('16px') // 420 - (364 + 40)
  })
})

describe('vertical anchoring', () => {
  test('bottom opens below the trigger, with the gap', () => {
    const pos = placePanel(ANCHORS.playerMore, VIEWPORT, 'bottom-end')
    expect(pos.top).toBe('62px') // 16 + 40 + 6
    expect(pos.bottom).toBeUndefined()
  })

  test('top opens above the trigger, anchored by its bottom edge', () => {
    // Anchoring by `bottom` rather than computing a `top` is what removes the panel
    // height from the calculation: a taller menu grows upwards on its own.
    const pos = placePanel(ANCHORS.playMode, VIEWPORT, 'top-start')
    expect(pos.bottom).toBe('148px') // 900 - 758 + 6
    expect(pos.top).toBeUndefined()
  })

  test('the height cap is the room actually left beside the trigger', () => {
    // This is what makes a seven-row sort menu scroll instead of running off the
    // bottom of the screen. The speed menu sits above a button 64px from the bottom.
    const below = placePanel(ANCHORS.librarySort, VIEWPORT, 'bottom-start')
    expect(below.maxHeight).toBe('695px') // top 197 ⇒ 900 - 197 - 8
    const above = placePanel(ANCHORS.playerSpeed, VIEWPORT, 'top')
    expect(above.maxHeight).toBe('822px') // bottom 70 ⇒ 900 - 70 - 8
  })

  test('caps never go negative for a trigger past the viewport edge', () => {
    // Can happen mid-transition, or with a stale rect from before a rotation.
    const pos = placePanel({ left: 10, top: 2000, width: 40, height: 40 }, VIEWPORT, 'bottom')
    expect(Number.parseFloat(pos.maxHeight)).toBeGreaterThanOrEqual(0)
    expect(Number.parseFloat(pos.maxWidth)).toBeGreaterThanOrEqual(0)
  })
})

/**
 * The fallback for hosts with no measurement bridge — unit tests included, which is
 * why every render test in the suite sees a panel positioned by this. It has to name
 * one offset per axis for the same reason a measured position does.
 */
test('the docked fallback names exactly one offset per axis', () => {
  expect(DOCKED_POSITION.left != null).not.toBe(DOCKED_POSITION.right != null)
  expect(DOCKED_POSITION.top != null).not.toBe(DOCKED_POSITION.bottom != null)
})
