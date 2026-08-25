import { readFileSync } from 'node:fs'
import path from 'node:path'

import { expect, test } from 'vitest'

/**
 * Static assertions on the More sheet stylesheet, in the shape of
 * `play-history-panel-css.test.ts` / `popover-menu-css.test.ts`: no layout
 * engine exists in the Vitest env, so the rules themselves are the only thing
 * assertable. What they pin is the overlay contract from AGENTS.md — a fixed
 * root with all four offsets, a backdrop sibling carrying outside-tap close,
 * and a panel whose offsets cannot fight an inline style.
 */

const CSS = path.resolve(__dirname, '../MoreTabsSheet.css')

/** CSS with comments stripped, so the prose above the rules cannot satisfy
 * these assertions in place of the properties. */
function rules(): string {
  return readFileSync(CSS, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
}

function block(css: string, selector: string): string {
  const match = new RegExp(`\\${selector}\\s*\\{([^}]*)\\}`).exec(css)
  expect(match, `missing rule for ${selector}`).not.toBeNull()
  return match![1]!
}

test('the sheet root is fixed with all four offsets', () => {
  // A fixed box with auto offsets falls back to its static position — below
  // the page for a shell-mounted overlay. All four must be explicit.
  const root = block(rules(), '.more-tabs')
  expect(root).toMatch(/position:\s*fixed/)
  expect(root).toMatch(/top:\s*0/)
  expect(root).toMatch(/left:\s*0/)
  expect(root).toMatch(/right:\s*0/)
  expect(root).toMatch(/bottom:\s*0/)
  expect(root).toMatch(/z-index:\s*100/)
})

test('the backdrop covers the root with all four offsets', () => {
  // Same rule as the root: an auto-offset absolute box lands at its static
  // position, and a short scrim leaves the page tappable beside the panel.
  const backdrop = block(rules(), '.more-tabs__backdrop')
  expect(backdrop).toMatch(/position:\s*absolute/)
  expect(backdrop).toMatch(/top:\s*0/)
  expect(backdrop).toMatch(/left:\s*0/)
  expect(backdrop).toMatch(/right:\s*0/)
  expect(backdrop).toMatch(/bottom:\s*0/)
})

test('the panel docks to one edge per axis, never two', () => {
  // `top` AND `bottom` on the same absolutely-positioned box stretches it
  // instead of sizing it by content (the PopoverMenu lesson). One offset per
  // axis is the construction that needs no second measurement.
  const panel = block(rules(), '.more-tabs__panel')
  expect(panel).toMatch(/bottom:\s*0/)
  expect(panel).not.toMatch(/top:/)
  // The sheet must be height-capped: up to 12 tabs exist, and an uncapped
  // panel could cover the whole screen.
  expect(panel).toMatch(/max-height:/)
})

test('the plugin label ellipsizes instead of wrapping the row', () => {
  // Plugin names come from the backend and can be arbitrarily long. Same
  // standard trio as `.play-history__title` — the properties that survive both
  // the native template encode and the web encode.
  const label = block(rules(), '.more-tabs__item-label')
  expect(label).toMatch(/white-space:\s*nowrap/)
  expect(label).toMatch(/overflow:\s*hidden/)
  expect(label).toMatch(/text-overflow:\s*ellipsis/)
})
