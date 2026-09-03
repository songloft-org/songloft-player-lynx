import { readFileSync } from 'node:fs'
import path from 'node:path'

import { expect, test } from 'vitest'

/**
 * Apple HIG design-token alignment gate (plan §1).
 *
 * `tokens-defined.test.ts` only proves every `var(--x)` resolves. This gate
 * proves the HIG additions themselves landed in `tokens.css` with the right
 * values — and, just as important, that the frozen legacy tiers were not
 * perturbed. Lynx drops an unrecognised custom-property declaration silently,
 * so a typo in a token name or value is invisible without a gate: the element
 * inherits and nothing warns. (The Docker-Chrome runtime check in the plan
 * confirms lynx-css actually registers them; this gate confirms the source.)
 */

const TOKENS = readFileSync(
  path.resolve(__dirname, '../tokens.css'),
  'utf8',
)

/** `.theme-root` block only — the theme-agnostic scale. Theme colours live in
 * `.theme-dark`/`.theme-light` and are not this gate's concern. */
const THEME_ROOT = TOKENS.match(/\.theme-root\s*\{([\s\S]*?)\n\}/)![1]!

/** Pull `--name: value;` declarations out of a CSS block, comments stripped. */
function parseDeclarations(block: string): Record<string, string> {
  const clean = block.replace(/\/\*[\s\S]*?\*\//g, '')
  const out: Record<string, string> = {}
  for (const m of clean.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    out[m[1]!] = m[2]!.trim()
  }
  return out
}

const decl = parseDeclarations(THEME_ROOT)

test('HIG iOS text-style tokens are present at the right px', () => {
  // HIG §4.7, 1pt ≈ 1px in Lynx.
  const expected = {
    '--font-caption2': '11px',
    '--font-caption1': '12px',
    '--font-footnote': '13px',
    '--font-subhead': '15px',
    '--font-callout': '16px',
    '--font-body': '17px',
    '--font-headline': '17px',
    '--font-title3': '20px',
    '--font-title2': '22px',
    '--font-title1': '28px',
    '--font-largeTitle': '34px',
  } as const
  for (const [name, value] of Object.entries(expected)) {
    expect(decl[name], `${name}`).toBe(value)
  }
})

test('font-weight tokens cover the HIG Regular→Bold ladder', () => {
  expect(decl['--weight-regular']).toBe('400')
  expect(decl['--weight-medium']).toBe('500')
  expect(decl['--weight-semibold']).toBe('600')
  expect(decl['--weight-bold']).toBe('700')
})

test('additional spacing tiers fill the gaps without touching the frozen six', () => {
  // The original 6 are consumed everywhere — values must not budge.
  const frozen = {
    '--space-1': '4px',
    '--space-2': '8px',
    '--space-3': '12px',
    '--space-4': '16px',
    '--space-5': '24px',
    '--space-6': '32px',
  } as const
  for (const [name, value] of Object.entries(frozen)) {
    expect(decl[name], `${name} (frozen)`).toBe(value)
  }
  // New tiers. --space-half is 2px because Lynx custom properties cannot take a
  // fractional name (no --space-0.5).
  expect(decl['--space-half']).toBe('2px')
  expect(decl['--space-7']).toBe('20px')
  expect(decl['--space-8']).toBe('28px')
  expect(decl['--space-9']).toBe('40px')
  expect(decl['--space-10']).toBe('48px')
})

test('radius and shadow additions land alongside the untouched originals', () => {
  // Frozen radii.
  expect(decl['--radius-sm']).toBe('8px')
  expect(decl['--radius-md']).toBe('12px')
  expect(decl['--radius-lg']).toBe('20px')
  expect(decl['--radius-xl']).toBe('28px')
  expect(decl['--radius-pill']).toBe('999px')
  // New small radius for badges / small buttons.
  expect(decl['--radius-xs']).toBe('6px')

  // --shadow-sm/md/lg are per-theme (in .theme-dark/.theme-light), so they are
  // NOT in the theme-root block. Only the theme-agnostic shadow extras live here.
  expect(decl['--shadow-none']).toBe('none')
  // --shadow-focus resolves --primary-faint at use time, so the literal is kept
  // verbatim — the theme-layer resolution is covered by the Docker-Chrome
  // runtime check, not by static text matching.
  expect(decl['--shadow-focus']).toBe('0 0 0 3px var(--primary-faint)')
})

test('HIG §12.2 control / tap-target sizes are declared', () => {
  expect(decl['--tap-target']).toBe('44px')
  expect(decl['--tap-target-min']).toBe('28px')
  expect(decl['--control-height']).toBe('44px')
  expect(decl['--control-height-sm']).toBe('36px')
})

test('legacy --font-* tokens keep their original values (no alias drift)', () => {
  // These have no exact HIG counterpart (10/14/28/36px); the plan keeps them
  // verbatim rather than aliasing, so 14px does not silently become 13 or 15.
  const frozen = {
    '--font-2xs': '10px',
    '--font-xs': '12px',
    '--font-sm': '14px',
    '--font-md': '16px',
    '--font-lg': '20px',
    '--font-xl': '28px',
    '--font-2xl': '36px',
  } as const
  for (const [name, value] of Object.entries(frozen)) {
    expect(decl[name], `${name} (legacy, frozen)`).toBe(value)
  }
})
