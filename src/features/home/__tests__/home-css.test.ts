import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { expect, test } from 'vitest'

/**
 * P4 home typography + card-surface migration, pinned where it silently regresses.
 *
 * Home is a PLAIN page (white in light), so its stats card is the grey
 * --secondary-system-background against the --system-background page — NOT a
 * grouped-page inversion (that is settings-only). The card is defined by that
 * contrast, not a hairline, and uses the grouped corner. A reverted border or
 * radius reads as a double outline / wrong shape with no layout break.
 */
const SRC = resolve(process.cwd(), 'src')
const CSS = readFileSync(resolve(SRC, 'features/home/pages/HomePage.css'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')

function ruleFor(selector: string): string {
  const escaped = selector.replace(/[.+*?^${}()|[\]\\]/g, '\\$&')
  const m = new RegExp(`(?:^|\\})\\s*${escaped}\\s*\\{([^}]*)\\}`, 'm').exec(CSS)
  expect(m, `HomePage.css has no rule for \`${selector}\``).not.toBeNull()
  return m![1]!
}

test('home uses the Apple large-title / title2 / subhead hierarchy', () => {
  expect(ruleFor('.home__greeting'), 'greeting is the large title (34)')
    .toMatch(/font-size:\s*var\(--font-largeTitle\)/)
  expect(ruleFor('.home-section__title'), 'section title is title2 (22), up from title3')
    .toMatch(/font-size:\s*var\(--font-title2\)/)
  expect(ruleFor('.home-section__action-text'), 'the action label is subhead (15), up from font-sm')
    .toMatch(/font-size:\s*var\(--font-subhead\)/)
  // The headline number stays at title1 (the plan keeps it): the greeting grew,
  // the stat number did not — the page's visual weight still leads with the
  // greeting, and the number reads as a figure rather than a headline.
  expect(ruleFor('.home-stats__headline-value')).toMatch(/font-size:\s*var\(--font-title1\)/)
  // Stat labels drop to footnote (13) — they are secondary, not body.
  expect(ruleFor('.home-stats__headline-label')).toMatch(/font-size:\s*var\(--font-footnote\)/)
})

test('the stats card is contrast-defined, not bordered, with the grouped corner', () => {
  const card = ruleFor('.home-stats')
  expect(card, 'card surface is the plain-page card colour (grey on white in light)')
    .toMatch(/background-color:\s*var\(--secondary-system-background\)/)
  expect(card, 'Apple grouped corner, not the large radius')
    .toMatch(/border-radius:\s*var\(--radius-grouped\)/)
  expect(
    card,
    'a border on top of the page/card contrast reads as a double outline',
  ).not.toMatch(/border(?!-radius)/)
})

test('the retry button uses the Apple fill, not the neutral alias', () => {
  expect(ruleFor('.home-section__retry')).toMatch(
    /background-color:\s*var\(--tertiary-system-fill\)/,
  )
})
