import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

import { expect, test } from 'vitest'

/**
 * Regression for the batch-19 device bug: every switch on the library-ops page
 * rendered ON exactly like OFF.
 *
 * Root cause was CSS, not logic. lynx-ui's `Switch` ships no styles — it only
 * appends `ui-checked` to each compound part's className — so the checked state
 * exists *only* if the consumer's stylesheet has a `.…__track.ui-checked` rule.
 * Three screens had each hand-copied that CSS and the third copy dropped the
 * rule (and `flex-direction: row`, without which the thumb's `flex-end` slides it
 * down rather than right, since Lynx's flex default is `column`).
 *
 * No render test can catch a missing CSS *rule*, so these two assert it
 * statically: the shared stylesheet still styles the checked state, and no screen
 * has re-forked its own switch CSS (the drift that caused the bug).
 */

const SRC = path.resolve(__dirname, '../../..')
const SHARED = 'shared/ui/AppSwitch.css'

function cssFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) return cssFiles(full)
    return entry.endsWith('.css') ? [path.relative(SRC, full)] : []
  })
}

/** CSS with comments removed — prose mentioning switches must not count as styling. */
function rules(relPath: string): string {
  return readFileSync(path.join(SRC, relPath), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
}

test('the shared switch stylesheet styles the checked state', () => {
  const css = rules(SHARED)
  expect(css).toMatch(/\.app-switch__track\.ui-checked\s*\{/)
  // Both halves of the visual change, either of which alone leaves it ambiguous.
  expect(css).toMatch(/\.app-switch__track\.ui-checked\s*\{[^}]*background-color/)
  expect(css).toMatch(/\.app-switch__track\.ui-checked\s*\{[^}]*justify-content:\s*flex-end/)
  // Lynx flex defaults to `column`; without this the thumb never moves sideways.
  expect(css).toMatch(/\.app-switch__track\s*\{[^}]*flex-direction:\s*row/)
})

test('no screen re-forks the switch CSS', () => {
  const forked = cssFiles(SRC)
    .filter((f) => f !== SHARED)
    .filter((f) => /switch-track|switch-thumb|app-switch/.test(rules(f)))
  expect(forked).toEqual([])
})

/**
 * Same drift, one control over: six screens had each hand-drawn a box-and-tick,
 * no two alike — 18/20/22/24px, `--radius-sm` / a hardcoded 4px / a radius that
 * made it a **circle** (which reads as single-choice, the opposite of a
 * multi-select), 1px / 2px / no border, and four of the six drew the tick as a
 * literal `✓` character instead of the icon set. Two of those ticks were invisible
 * because their colour was an undefined token (see `tokens-defined.test.ts`).
 */
test('the shared checkbox styles the checked state', () => {
  const css = rules('shared/ui/AppCheckbox.css')
  expect(css).toMatch(/\.app-checkbox\s*\{/)
  expect(css).toMatch(/\.app-checkbox--on\s*\{[^}]*background-color:\s*var\(--primary\)/)
  // A square, not a circle: the circle is what made a multi-select look like a
  // radio group.
  expect(css).toMatch(/\.app-checkbox\s*\{[^}]*border-radius:\s*var\(--radius-sm\)/)
})

test('no screen re-forks the checkbox CSS', () => {
  const forked = cssFiles(SRC)
    .filter((f) => f !== 'shared/ui/AppCheckbox.css')
    .filter((f) => {
      const css = rules(f)
      // A rule that both draws a box and fills it with the primary colour is a
      // checkbox by any other name.
      return /border-radius[^;]*;[^}]*border-(width|:)/.test(css)
        && /background-color:\s*var\(--primary\)[^}]*\}/.test(css)
        && /(check|toggle|badge|box)/.test(css)
    })
  expect(forked).toEqual([])
})

test('no screen re-forks the confirmation-dialog CSS', () => {
  // Two copies existed (Settings' logout, the duplicate-detection page) and had
  // already diverged on DESIGN.md's rule that `--danger` is text only, never a
  // fill. A third copy is how that rule gets lost again.
  const forked = cssFiles(SRC)
    .filter((f) => f !== 'shared/ui/ConfirmDialog.css')
    .filter((f) => /__backdrop-inner|dialog__btn|dialog__actions/.test(rules(f)))
  expect(forked).toEqual([])
})
