import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, test } from 'vitest'

/**
 * No selector may be declared in two of the player's stylesheets.
 *
 * The player's CSS was one 680-line file until it was split per widget. Splitting
 * introduces a failure mode the single file could not have: with the same selector in
 * two files, which one wins depends on the order the bundler happens to concatenate
 * them, i.e. on module import order. That is invisible in the diff, invisible in
 * review, and changes when an unrelated import moves.
 *
 * Nothing else in the tree checks this, and CSS has no equivalent of a duplicate-symbol
 * error — the second declaration just quietly shadows the first.
 */

const PLAYER = path.resolve(__dirname, '..')
const SHEET_DIRS = [path.join(PLAYER, 'pages'), path.join(PLAYER, 'widgets')]

function stylesheets(): { file: string, css: string }[] {
  return SHEET_DIRS.flatMap((dir) =>
    readdirSync(dir)
      .filter((f) => f.endsWith('.css'))
      .map((f) => ({
        file: `${path.basename(dir)}/${f}`,
        // Strip comments: a selector named in prose is not a declaration.
        css: readFileSync(path.join(dir, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, ''),
      })),
  )
}

/** Top-level rule heads, e.g. `.a`, `.a.b`, `.a .b`, `@keyframes x`. */
function selectors(css: string): string[] {
  const heads: string[] = []
  let depth = 0
  let head = ''
  for (const ch of css) {
    if (ch === '{') {
      if (depth === 0) heads.push(head.trim().replace(/\s+/g, ' '))
      depth += 1
      head = ''
    } else if (ch === '}') {
      depth = Math.max(0, depth - 1)
      head = ''
    } else if (depth === 0) {
      head += ch
    }
  }
  return heads.filter(Boolean)
}

describe('player stylesheets do not shadow each other', () => {
  const sheets = stylesheets()

  test('the sheets were found', () => {
    // Guards the derivation: an empty list would make the duplicate check vacuous.
    expect(sheets.length).toBeGreaterThanOrEqual(8)
    expect(sheets.map((s) => s.file)).toContain('pages/FullPlayerPage.css')
  })

  test('every selector is declared in exactly one file', () => {
    const owners = new Map<string, string[]>()
    for (const { file, css } of sheets) {
      for (const sel of new Set(selectors(css))) {
        owners.set(sel, [...(owners.get(sel) ?? []), file])
      }
    }
    const shared = [...owners.entries()]
      .filter(([, files]) => files.length > 1)
      .map(([sel, files]) => `${sel} → ${files.join(', ')}`)
      .sort()

    expect(
      shared,
      'These selectors are declared in more than one player stylesheet. Which one wins '
      + 'depends on bundler import order. Move each to a single owner (shared sheet '
      + 'chrome belongs in widgets/SheetShell.css).',
    ).toEqual([])
  })

  /**
   * The page keeps only its own chrome. Widget rules living here is exactly the state
   * the split undid: `LyricsView`, `PlaylistDrawer` and `SleepTimerSheet` were
   * unstyled at any mount point that did not go through this page.
   */
  test('the page stylesheet declares only .full-player rules', () => {
    const page = sheets.find((s) => s.file === 'pages/FullPlayerPage.css')!
    const strays = selectors(page.css)
      .filter((sel) => !sel.startsWith('.full-player') && !sel.startsWith('@keyframes'))
    expect(
      strays,
      'FullPlayerPage.css must hold page chrome only; widget rules belong next to the '
      + 'widget that renders them.',
    ).toEqual([])
  })
})
