import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { expect, test } from 'vitest'

/**
 * P3 nav metric + colour migration, pinned where it can silently regress.
 *
 * The floating capsule itself is frozen (AGENTS.md: `--radius-nav` and the
 * capsule shape do not change), so P3 only retuned measures and colours. Each
 * change below is silent if lost: a reverted token just hardcodes the number
 * again, and a reverted colour recolours navigation without breaking layout.
 */
const SRC = resolve(process.cwd(), 'src')
const CSS = readFileSync(resolve(SRC, 'shared/layouts/ShellLayout.css'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
const TOKENS = readFileSync(resolve(SRC, 'shared/theme/tokens.css'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')

/** One rule body by exact selector. */
function ruleFor(selector: string): string {
  const escaped = selector.replace(/[.+*?^${}()|[\]\\]/g, '\\$&')
  const m = new RegExp(`(?:^|\\})\\s*${escaped}\\s*\\{([^}]*)\\}`, 'm').exec(CSS)
  expect(m, `ShellLayout.css has no rule for \`${selector}\``).not.toBeNull()
  return m![1]!
}

test('the bar, pill and plugin-icon sizes are tokenized, not hardcoded', () => {
  expect(ruleFor('.shell__bottombar'), 'bar height must consume --bottombar-height')
    .toMatch(/height:\s*var\(--bottombar-height\)/)
  expect(
    ruleFor('.shell__bottombar .nav-item--active .nav-item__pill'),
    'active pill height must consume --nav-pill-height',
  ).toMatch(/height:\s*var\(--nav-pill-height\)/)
  const plugin = ruleFor('.nav-item__plugin-icon')
  expect(plugin, 'plugin icon width must consume --nav-icon-size')
    .toMatch(/width:\s*var\(--nav-icon-size\)/)
  expect(plugin, 'plugin icon height must consume --nav-icon-size')
    .toMatch(/height:\s*var\(--nav-icon-size\)/)
})

test('the dead --mobile-nav-height token is gone', () => {
  // It was declared at 60px and consumed nowhere — the actual bar is 64. P3
  // deleted it rather than leave a misleadingly-valued dead token. If it
  // returns, the bar has two competing height tokens again.
  expect(TOKENS, '--mobile-nav-height must not be re-declared (it was dead at 60px)')
    .not.toMatch(/--mobile-nav-height/)
})

test('inactive tab labels are the secondary tier, not tertiary', () => {
  // Tab labels are necessary navigation, so --secondary-label (the floor that
  // clears 3:1), never --tertiary-label. The bottom-bar label also takes
  // medium weight (smallest text in the app, over glass).
  //
  // Two `.nav-item__label` rules exist (a clamp rule without colour, and the
  // colour rule). Match the colour where it is actually declared rather than
  // via `ruleFor`, which returns the first (clamp) rule.
  expect(
    CSS,
    'the inactive label colour is the Apple secondary tier',
  ).toMatch(/\.nav-item__label\s*\{[^}]*color:\s*var\(--secondary-label\)/)
  const bottomLabel = ruleFor('.shell__bottombar .nav-item__label')
  expect(bottomLabel).toMatch(/font-size:\s*var\(--font-2xs\)/)
  expect(bottomLabel).toMatch(/font-weight:\s*var\(--weight-medium\)/)
})

test('the rail surface and section header migrated to Apple names', () => {
  const rail = ruleFor('.shell__rail')
  expect(rail, 'rail background is the Apple plain-group card colour')
    .toMatch(/background-color:\s*var\(--secondary-system-background\)/)
  expect(rail).toMatch(/border-right:\s*1px solid var\(--separator\)/)
  expect(ruleFor('.shell__rail-group-header')).toMatch(/color:\s*var\(--secondary-label\)/)
  expect(ruleFor('.shell__brand-icon')).toMatch(/border-radius:\s*var\(--radius-sm\)/)
})
