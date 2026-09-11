import { readFileSync } from 'node:fs'
import path from 'node:path'

import { expect, test } from 'vitest'

/**
 * Press feedback is one system: every interactive surface dims on touch through
 * Lynx's `:active` pseudo-class (lynx-api-docs/css/pseudo-classes.md), with the
 * amounts coming from `--press-opacity` / `--press-scale` in `tokens.css`.
 *
 * Why this is a static test: a missing `:active` rule breaks nothing. The
 * control still taps, still navigates, still plays — it just feels dead, and no
 * render test can observe that. Before this batch the whole repo had exactly one
 * such rule (`.facet-card` in `LibraryPage.css`), so "regress back to one" is
 * the realistic failure this pins.
 *
 * Reverse verified: delete the `:active` block for any selector listed in
 * `PRESS_RULES` and the matching case fails. That is the point of it existing.
 */

const SRC = path.resolve(__dirname, '../../..')

/** CSS with comments stripped — prose about pressing must not satisfy a rule. */
function rules(relPath: string): string {
  return readFileSync(path.join(SRC, relPath), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
}

/** Body of the first rule whose selector starts with `selector`. */
function ruleBody(relPath: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`${escaped}[^{]*\\{([^}]*)\\}`).exec(rules(relPath))?.[1] ?? ''
}

const TOKENS = 'shared/theme/tokens.css'

/** Interactive surfaces that must dim on touch, and the file owning each. */
const PRESS_RULES: ReadonlyArray<readonly [string, string]> = [
  ['.nav-item:active', 'shared/layouts/ShellLayout.css'],
  ['.song-row:active', 'features/library/widgets/SongRow.css'],
  ['.media-list-item:active', 'shared/ui/MediaListItem.css'],
  ['.mini-player:active', 'features/player/widgets/MiniPlayer.css'],
  ['.player-controls__btn:active', 'features/player/widgets/PlayControls.css'],
]

test('the press amounts are declared once, as tokens', () => {
  const tokens = rules(TOKENS)
  expect(tokens).toMatch(/--press-opacity:\s*0\.7;/)
  expect(tokens).toMatch(/--press-scale:\s*0\.97;/)
})

test.each(PRESS_RULES)('%s dims on touch (%s)', (selector, file) => {
  expect(
    ruleBody(file, selector),
    `${selector} must take the dim from the token, not a literal`,
  ).toMatch(/opacity:\s*var\(--press-opacity\)/)
})

test('rows dim with opacity ALONE — never transform', () => {
  /*
   * A transformed element becomes an independent compositing layer, and that
   * layer's coordinate transform may not include the parent container's scroll
   * offset (lynx-vs-web/css-differences.md). Every selector below sits either
   * inside a virtual <list> or inside a fixed capsule, so a `transform` here is
   * the exact shape of that bug.
   */
  const rows: ReadonlyArray<readonly [string, string]> = [
    ['features/library/widgets/SongRow.css', '.song-row:active'],
    ['shared/ui/MediaListItem.css', '.media-list-item:active'],
    ['shared/layouts/ShellLayout.css', '.nav-item:active'],
    ['features/player/widgets/MiniPlayer.css', '.mini-player:active'],
  ]
  for (const [file, selector] of rows) {
    expect(ruleBody(file, selector), `${selector} must not transform`).not.toMatch(/transform/)
  }
})

test('the standalone primary control does scale', () => {
  /*
   * Non-vacuity for the guard above: if nothing consumed `--press-scale`, that
   * guard would be protecting a rule that could never be written anyway, and the
   * token would be dead weight of the kind this repo already had to clean up.
   */
  expect(
    ruleBody('features/player/widgets/PlayControls.css', '.player-controls__btn--primary:active'),
    '--press-scale needs a real consumer',
  ).toMatch(/transform:\s*scale\(var\(--press-scale\)\)/)
})

test('a disabled control suppresses the press dim', () => {
  /*
   * Lynx matches `:active` on touch whether or not a handler is bound, so
   * `--disabled` (the only other channel — `:disabled` parses but never matches,
   * see the pseudo-class reference) has to exclude itself explicitly. Without
   * this a disabled control dims on tap, which reads as "it did something".
   */
  expect(rules('features/player/widgets/PlayControls.css')).toMatch(
    /\.player-controls__btn:active:not\(\.player-controls__btn--disabled\)/,
  )
})

test('every press transition reads the motion tokens', () => {
  /*
   * Hard-coded durations would keep animating under reduce-motion: the
   * `.reduce-motion` class only zeroes `--duration-*`
   * (see the motion block in tokens.css). So a press transition that scrolls
   * past the tokens is a reduce-motion hole.
   */
  for (const file of new Set(PRESS_RULES.map(([, f]) => f))) {
    for (const decl of rules(file).match(/transition:[^;]*;/g) ?? []) {
      if (!/opacity/.test(decl)) continue
      expect(decl, `${file}: "${decl.trim()}" must use a --duration-* token`).toMatch(
        /var\(--duration-(fast|normal|slow)\)/,
      )
    }
  }
})
