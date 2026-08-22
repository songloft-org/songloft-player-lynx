import { readFileSync } from 'node:fs'
import path from 'node:path'

import { expect, test } from 'vitest'

/**
 * Static assertions on the song menu's stylesheet — the counterpart of
 * `popover-menu-css.test.ts`, and for the same reason: the Vitest env has no layout
 * engine, so neither a backdrop's box nor a panel's fill is ever resolved by a render
 * test. This file was missing while the stylesheet was rewritten twice.
 */

const CSS = path.resolve(__dirname, '../GlobalMenu.css')

/** CSS with comments stripped — the prose above each rule names the very properties
 *  asserted below, and must not be what satisfies the assertions. */
function rules(): string {
  return readFileSync(CSS, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
}

function block(selector: string): string {
  const match = new RegExp(`\\${selector}\\s*\\{([^}]*)\\}`).exec(rules())
  expect(match, `missing rule for ${selector}`).not.toBeNull()
  return match![1]!
}

/**
 * A `position: fixed` box whose offsets are `auto` resolves to its *static* position —
 * for a root-route overlay, behind the page content. That exact bug shipped in the
 * popover backdrop (see `popover-menu-css.test.ts`), which is why both the root and
 * the catcher pin all four edges here.
 */
test('the menu root and its tap catcher both span the viewport', () => {
  for (const [selector, expectedPosition] of [
    ['.global-menu', 'fixed'],
    ['.global-menu__backdrop', 'absolute'],
  ] as const) {
    const rule = block(selector)
    expect(rule).toMatch(new RegExp(`position:\\s*${expectedPosition}`))
    for (const edge of ['top', 'left', 'right', 'bottom']) {
      expect(rule, `${selector} must pin ${edge}`).toMatch(
        new RegExp(`(^|[;\\s])${edge}:\\s*0`),
      )
    }
  }
})

/**
 * The anchored menu is a popover, so its catcher must not paint: a scrim behind it was
 * the one thing that made the song menu look like a different mechanism from the sort /
 * speed / play-mode menus, which use the unfilled `.popover-backdrop`.
 *
 * The dimming lives on the docked modifier instead — that form *is* modal, and a bottom
 * sheet with nothing dimmed behind it reads as a panel that failed to open.
 */
test('only the docked fallback dims what is behind it', () => {
  expect(block('.global-menu__backdrop')).not.toMatch(/background/)
  expect(block('.global-menu__backdrop--docked')).toMatch(/background-color:\s*var\(--backdrop\)/)
})

/**
 * The load-bearing half of "the anchored panel is placed entirely from inline style"
 * (`anchored-overlay.ts`): a fixed/absolute box given *both* `top` and `bottom` is
 * stretched between them rather than sized by its content, so an offset left in the
 * shared rule would not be overridden by the inline one — it would combine with it.
 * The docked form is the only one allowed to bring offsets, and it brings its own.
 */
test('the shared panel rule declares no offsets, and the docked one does', () => {
  const shared = block('.global-menu__panel')
  for (const edge of ['top', 'right', 'bottom', 'left']) {
    expect(shared, `.global-menu__panel must leave ${edge} to the form modifiers`).not.toMatch(
      new RegExp(`(^|[;\\s])${edge}:`),
    )
  }
  const docked = block('.global-menu__panel--docked')
  for (const edge of ['bottom', 'left', 'right']) {
    expect(docked, `.global-menu__panel--docked must pin ${edge}`).toMatch(
      new RegExp(`(^|[;\\s])${edge}:\\s*0`),
    )
  }
  // And not `top`: with `bottom` already set, that would stretch the sheet full height.
  expect(docked).not.toMatch(/(^|[;\s])top:/)
  // The anchored form gets every offset inline, so it may declare none.
  const anchored = block('.global-menu__panel--anchored')
  for (const edge of ['top', 'right', 'bottom', 'left']) {
    expect(anchored, `.global-menu__panel--anchored must leave ${edge} inline`).not.toMatch(
      new RegExp(`(^|[;\\s])${edge}:`),
    )
  }
})

/** Paired with the inline `max-height`: a capped panel with no scroller just hides its
 *  last rows, and the docked sheet is capped at 60% by the stylesheet. */
test('the panel scrolls when it is capped', () => {
  expect(block('.global-menu__panel')).toMatch(/overflow-y:\s*auto/)
  expect(block('.global-menu__panel--docked')).toMatch(/max-height:/)
})

/** Item taps must not land on the catcher, which would close the menu and silently
 *  drop the selection. */
test('the panel layers above the tap catcher', () => {
  const zIndex = (selector: string) => {
    const declared = /z-index:\s*(-?\d+)/.exec(block(selector))
    expect(declared, `${selector} must declare an explicit z-index`).not.toBeNull()
    return Number(declared![1])
  }
  expect(zIndex('.global-menu__panel')).toBeGreaterThan(zIndex('.global-menu'))
  expect(zIndex('.global-menu')).toBeGreaterThanOrEqual(100)
})
