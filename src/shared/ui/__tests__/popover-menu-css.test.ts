import { readFileSync } from 'node:fs'
import path from 'node:path'

import { expect, test } from 'vitest'

/**
 * Regression for the play-mode / speed popovers being able to sit open at the
 * same time: tapping the second trigger should have dismissed the first menu.
 *
 * Root cause was CSS, not logic. `PopoverBackdrop` is the outside-tap catcher and
 * lynx-ui-popover's own stylesheet sizes it `100vw × 100vh` but sets no `top` /
 * `left`. A fixed box with auto offsets resolves to its *static* position, which
 * is deep inside the positioner beside the trigger — so it spanned a
 * viewport-sized area measured from the popover rather than from the screen, and
 * everything above/left of the popover stayed tappable. Speed menu (top-right)
 * open ⇒ the play-mode button (bottom-left) was outside the backdrop.
 *
 * No render test can catch this: the Vitest env has no layout engine, so the
 * backdrop's computed box is never resolved. Hence a static assertion.
 */

const CSS = path.resolve(__dirname, '../PopoverMenu.css')

/** CSS with comments stripped — the prose above the rules explains `top`/`left`
 *  and `z-index`, and must not be what satisfies these assertions. */
function rules(): string {
  return readFileSync(CSS, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
}

function block(css: string, selector: string): string {
  const match = new RegExp(`\\${selector}\\s*\\{([^}]*)\\}`).exec(css)
  expect(match, `missing rule for ${selector}`).not.toBeNull()
  return match![1]
}

function zIndexOf(css: string, selector: string): number {
  const declared = /z-index:\s*(-?\d+)/.exec(block(css, selector))
  expect(declared, `${selector} must declare an explicit z-index`).not.toBeNull()
  return Number(declared![1])
}

test('the popover backdrop is pinned to the viewport origin', () => {
  const backdrop = block(rules(), '.popover-backdrop')
  // Both halves matter: either offset left at `auto` re-anchors the backdrop to
  // the popover and reopens the "two menus at once" hole.
  expect(backdrop).toMatch(/(^|[;\s])top:\s*0/)
  expect(backdrop).toMatch(/(^|[;\s])left:\s*0/)
})

test('the popover menu panel layers above its own backdrop', () => {
  const css = rules()
  // Otherwise item taps land on the backdrop, which merely closes the menu —
  // the selection silently never happens.
  expect(zIndexOf(css, '.popover-menu')).toBeGreaterThan(
    zIndexOf(css, '.popover-backdrop'),
  )
  // The backdrop still has to cover ordinary page content to catch outside taps,
  // so it sits on the same overlay layer as the app's other backdrops.
  expect(zIndexOf(css, '.popover-backdrop')).toBeGreaterThanOrEqual(100)
})

/**
 * These two rules look cosmetic and are not: `PopoverContent` holds the Presence
 * `bindtransitionend` handler, and Presence stays in `Leaving` until it fires.
 * Declare no transition and it instead spins `MAX_WAIT_FRAMES` (24) single-frame
 * `lynx.requestAnimationFrame` hops before unmounting, which on the background
 * thread reads as the menu hanging about a second behind the tap.
 */
test('the popover menu transitions opacity so Presence can unmount promptly', () => {
  const css = rules()
  const panel = block(css, '.popover-menu')
  // `all`/unqualified shorthands count too — what matters is that opacity is
  // transitioned, since that is the property `ui-closed` changes.
  expect(panel).toMatch(/transition:[^;]*\b(opacity|all)\b/)
  // A transition alone fires nothing: the value has to actually change when
  // Presence swaps the class, so this pair is the whole mechanism.
  expect(block(css, '.popover-menu.ui-closed')).toMatch(/opacity:\s*0/)
})
