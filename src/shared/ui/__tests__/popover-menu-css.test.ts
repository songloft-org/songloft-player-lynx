import { readFileSync } from 'node:fs'
import path from 'node:path'

import { expect, test } from 'vitest'

/**
 * Static assertions on the popover stylesheet. Each one stands for a bug that
 * shipped, and none of them can be caught by a render test: the Vitest env has no
 * layout engine, so a backdrop's or panel's computed box is never resolved.
 */

const CSS = path.resolve(__dirname, '../PopoverMenu.css')

/** CSS with comments stripped — the prose above the rules restates every property
 *  name below, and must not be what satisfies these assertions. */
function rules(): string {
  return readFileSync(CSS, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
}

function block(css: string, selector: string): string {
  const match = new RegExp(`\\${selector}\\s*\\{([^}]*)\\}`).exec(css)
  expect(match, `missing rule for ${selector}`).not.toBeNull()
  return match![1]!
}

function zIndexOf(css: string, selector: string): number {
  const declared = /z-index:\s*(-?\d+)/.exec(block(css, selector))
  expect(declared, `${selector} must declare an explicit z-index`).not.toBeNull()
  return Number(declared![1])
}

/**
 * Regression for the play-mode / speed popovers being able to sit open at the same
 * time: tapping the second trigger should have dismissed the first menu.
 *
 * Root cause was CSS, not logic. The backdrop is the outside-tap catcher, and
 * lynx-ui-popover's stylesheet sized it `100vw × 100vh` with no `top` / `left`. A
 * fixed box with auto offsets resolves to its *static* position, which was deep
 * inside the positioner beside the trigger — so it spanned a viewport-sized area
 * measured from the popover rather than from the screen, and everything
 * above/left of the popover stayed tappable.
 */
test('the popover backdrop covers the viewport from its origin', () => {
  const backdrop = block(rules(), '.popover-backdrop')
  expect(backdrop).toMatch(/position:\s*fixed/)
  // All four, and each one matters: any offset left at `auto` re-anchors that edge
  // to the panel's static position and reopens the "two menus at once" hole.
  for (const edge of ['top', 'left', 'right', 'bottom']) {
    expect(backdrop, `.popover-backdrop must pin ${edge}`).toMatch(
      new RegExp(`(^|[;\\s])${edge}:\\s*0`),
    )
  }
})

test('the popover panel layers above its own backdrop', () => {
  const css = rules()
  // Otherwise item taps land on the backdrop, which merely closes the menu — the
  // selection silently never happens.
  expect(zIndexOf(css, '.popover-menu')).toBeGreaterThan(
    zIndexOf(css, '.popover-backdrop'),
  )
  // The backdrop still has to cover ordinary page content to catch outside taps,
  // so it sits on the same overlay layer as the app's other backdrops.
  expect(zIndexOf(css, '.popover-backdrop')).toBeGreaterThanOrEqual(100)
})

/**
 * The panel is placed entirely from inline style (`anchored-overlay.ts`). This is
 * the load-bearing half of that arrangement: a `position: fixed` box given *both*
 * `top` and `bottom` is stretched between them instead of sized by its content, so
 * a fallback offset here would not be "overridden" by the inline one — it would
 * combine with it and pull the panel down the whole screen. Same for
 * `left` + `right`.
 *
 * `position: fixed` rather than `absolute` is the other half: the panel is a
 * sibling of the trigger inside a toolbar row, and an absolute box resolves against
 * whichever ancestor happens to be positioned. That mismatch is what put five of
 * this app's popovers off their button and two of them off-screen entirely.
 */
test('the popover panel is fixed and declares no offsets of its own', () => {
  const panel = block(rules(), '.popover-menu')
  expect(panel).toMatch(/position:\s*fixed/)
  for (const edge of ['top', 'right', 'bottom', 'left']) {
    expect(panel, `.popover-menu must leave ${edge} to the inline position`).not.toMatch(
      new RegExp(`(^|[;\\s])${edge}:`),
    )
  }
})

/**
 * Paired with the inline `max-height`: the cap is what keeps a long menu on screen,
 * and without a scroller the capped panel would just clip its last rows with no way
 * to reach them.
 */
test('the popover panel scrolls when the anchor leaves it little room', () => {
  expect(block(rules(), '.popover-menu')).toMatch(/overflow-y:\s*auto/)
})

/**
 * Menu labels never wrap. Shared by `PopoverMenu` and `GlobalMenu` (see
 * `MenuItem.tsx`), so this one rule keeps both honest.
 *
 * A CJK label offers a break opportunity at every glyph, so its intrinsic width
 * is one character; a `flex: 1` label with default `white-space` will then let
 * the row shrink to the panel's `min-width` and wrap the text rather than widen
 * the panel. That is how "睡眠定时" broke onto two lines in the player's overflow
 * menu (140px min) once a trailing checkmark took the last glyph's room.
 * `nowrap` makes the label push the panel wider instead (capped by placePanel).
 */
test('menu labels do not wrap', () => {
  expect(
    block(rules(), '.popover-menu__item-label'),
    '.popover-menu__item-label must set white-space: nowrap, or long/CJK labels '
      + 'wrap to a second line inside a narrow panel',
  ).toMatch(/white-space:\s*nowrap/)
})
