import { readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, test } from 'vitest'

/**
 * Structural gate for the player's two bottom sheets (queue + sleep timer).
 *
 * The bug this exists for was invisible to every render test in the tree: the DOM
 * was complete and correct, and both sheets *were* on screen — just underneath the
 * player. `.full-player__layer` is a flex item with `z-index: 1` (it keeps
 * `.player-backdrop` below the content), the sheet viewport is its sibling, and a
 * viewport at `z-index: auto` paints at level 0. So the cover, title, progress bar
 * and transport row drew straight over the sheet, and the rows they covered could
 * not be tapped. Only a screenshot could see it, and no test env has a paint order.
 *
 * Comments are stripped before every assertion — `popover-menu-css.test.ts` learned
 * the hard way that a substring gate happily passes on the comment that explains a
 * rule after the rule itself has been deleted.
 */

const WIDGETS = path.resolve(__dirname, '../widgets')

function stripped(file: string): string {
  return readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
}

/** Declarations of one top-level rule, as a `prop → value` map. */
function rule(css: string, selector: string): Record<string, string> {
  const re = new RegExp(
    `(?:^|\\})\\s*${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`,
  )
  const m = css.match(re)
  expect(m, `rule ${selector} not found`).not.toBeNull()
  const out: Record<string, string> = {}
  for (const decl of m![1]!.split(';')) {
    const i = decl.indexOf(':')
    if (i < 0) continue
    out[decl.slice(0, i).trim()] = decl.slice(i + 1).trim()
  }
  return out
}

const VIEWPORT = rule(stripped(path.join(WIDGETS, 'SheetShell.css')), '.drawer__viewport')

describe('the bottom sheets paint above the player, not under it', () => {
  test('the viewport is lifted above the content layer', () => {
    const sheetZ = Number(VIEWPORT['z-index'])
    const layerZ = Number(
      rule(
        stripped(path.resolve(__dirname, '../pages/FullPlayerPage.css')),
        '.full-player__layer',
      )['z-index'],
    )
    expect(Number.isFinite(sheetZ), '.drawer__viewport needs an explicit z-index').toBe(true)
    expect(Number.isFinite(layerZ), '.full-player__layer needs an explicit z-index').toBe(true)
    expect(
      sheetZ,
      'the sheet viewport must outrank .full-player__layer, or the player paints over '
        + 'the sheet — see the header of SheetShell.css',
    ).toBeGreaterThan(layerZ)
  })

  test('all four offsets are declared, since the element is fixed', () => {
    // `SheetView` inlines `position: fixed`, and a fixed box with auto offsets sits at
    // its *static* position instead of spanning the screen. Same trap as
    // `.popover-backdrop` (see `popover-menu-css.test.ts`).
    expect(VIEWPORT['position']).toBe('fixed')
    for (const edge of ['top', 'right', 'bottom', 'left']) {
      expect(VIEWPORT[edge], `.drawer__viewport must declare ${edge}`).toBe('0')
    }
  })

  test('both sheets put that class on SheetView, the element that is fixed', () => {
    // The z-index has to land on the fixed element: it is the stacking context, so a
    // level on the backdrop or the card inside it can only order them against each
    // other — never lift the sheet out from under the player.
    for (const file of ['PlaylistDrawer.tsx', 'SleepTimerSheet.tsx']) {
      expect(
        stripped(path.join(WIDGETS, file)),
        `${file}: <SheetView> must carry className='drawer__viewport'`,
      ).toMatch(/<SheetView\s+className='drawer__viewport'/)
    }
  })
})
