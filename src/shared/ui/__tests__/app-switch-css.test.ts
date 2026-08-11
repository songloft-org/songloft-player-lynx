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
