import { readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, test } from 'vitest'

/**
 * Structural gate for the player's two bottom sheets (queue + sleep timer).
 *
 * The sheets now use the same hand-rolled pattern as AddToPlaylistSheet and
 * PlayHistoryPanel: a fixed root (.drawer__root) with z-index: 100, an
 * absolute backdrop, and an absolute panel with explicit height. This
 * guarantees stable height on all platforms.
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

const CSS = stripped(path.join(WIDGETS, 'SheetShell.css'))
const ROOT = rule(CSS, '.drawer__root')

describe('the bottom sheets paint above the player, not under it', () => {
  test('the root is lifted above the content layer', () => {
    const sheetZ = Number(ROOT['z-index'])
    const layerZ = Number(
      rule(
        stripped(path.resolve(__dirname, '../pages/FullPlayerPage.css')),
        '.full-player__layer',
      )['z-index'],
    )
    expect(Number.isFinite(sheetZ), '.drawer__root needs an explicit z-index').toBe(true)
    expect(Number.isFinite(layerZ), '.full-player__layer needs an explicit z-index').toBe(true)
    expect(
      sheetZ,
      'the sheet root must outrank .full-player__layer, or the player paints over '
        + 'the sheet — see the header of SheetShell.css',
    ).toBeGreaterThan(layerZ)
  })

  test('all four offsets are declared on the fixed root', () => {
    expect(ROOT['position']).toBe('fixed')
    for (const edge of ['top', 'right', 'bottom', 'left']) {
      expect(ROOT[edge], `.drawer__root must declare ${edge}`).toBe('0')
    }
  })

  test('both sheets use the drawer__root class on their root element', () => {
    for (const file of ['PlaylistDrawer.tsx', 'SleepTimerSheet.tsx']) {
      const src = stripped(path.join(WIDGETS, file))
      expect(
        src,
        `${file}: root element must carry className='drawer__root'`,
      ).toContain("className='drawer__root'")
    }
  })

  test('panels have explicit height', () => {
    const queuePanel = rule(CSS, '.drawer__panel--queue')
    const sleepPanel = rule(CSS, '.drawer__panel--sleep')
    expect(queuePanel['height'], 'queue panel needs explicit height').toBe('70%')
    expect(sleepPanel['height'], 'sleep panel needs explicit height').toBe('60%')
  })
})
