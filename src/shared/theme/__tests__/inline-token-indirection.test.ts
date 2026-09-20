import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

import { expect, test } from 'vitest'

import { safeAreaStyleVars, SAFE_AREA_VARS } from '../../../native/safe-area.js'
import { themePackToStyleVars } from '../theme-pack-mapping.js'

/**
 * No `calc()`-bearing custom property may consume an **inline-overridden** token.
 *
 * `ThemeProvider` writes two families of tokens as inline custom properties on
 * `.theme-root`: the theme pack's mapping (`themePackToStyleVars`) and the host's
 * safe-area insets (`safeAreaStyleVars`). Inline beats the class declarations, so
 * that is how a pack recolours the tree and how iOS supplies the insets its engine
 * cannot resolve from `env()`.
 *
 * On iOS that override reaches a `var()` used **directly in a property value** —
 * measured: `padding-top: var(--safe-top)` laid out at 62px, and inside a calc on a
 * property too (the nav capsule's `bottom: calc(var(--space-2) + var(--safe-bottom))`
 * computed to 42px). It does **not** reach a `var()` nested inside *another custom
 * property's* value, which resolves against the stylesheet declaration instead:
 * forcing `--font-scale: 2` inline left `.nav-item__label` at 16.7pt and a page's
 * content height unchanged to the pixel, i.e. `calc(10px * var(--font-scale))` still
 * used the class-declared `1`.
 *
 * Two shipped defects came out of that gap, and both were silent:
 *  - `--nav-inset: calc(80px + var(--safe-bottom))` made the token invalid at
 *    computed-value time, so all ~15 consumers lost their tail padding — and the
 *    `, 80px` fallback did not help, because a fallback applies only when a custom
 *    property is *undefined*, not when its value is invalid. Lists ended under the
 *    floating capsule ("滚不到底").
 *  - the font-scale accessibility setting does nothing on iOS (allowlisted below,
 *    filed in `docs/project/bugs.md`).
 *
 * The token set is **derived, not hand-listed**: it is exactly the keys the two
 * providers emit, so a new inline token is covered the moment it is added. A
 * handwritten list is how this gate would end up green and blind.
 */

const SRC = path.resolve(__dirname, '../../..')

/** Every token `ThemeProvider` sets inline, from the providers themselves. */
function inlineOverriddenTokens(): Set<string> {
  const pack = themePackToStyleVars(null, 'light')
  const safe = safeAreaStyleVars({ top: 1, bottom: 1, left: 1, right: 1 })
  return new Set([...Object.keys(pack), ...Object.keys(safe)])
}

/**
 * Known violations, i.e. debt this gate documents rather than permits silently.
 * Removing an entry requires fixing the token, not deleting the line.
 *
 * All twelve are the HIG text-style scale: `calc(Npx * var(--font-scale))`. They
 * still produce correct sizes at the default scale, which is why this shipped — the
 * only thing broken is the user's font-scale choice on iOS. Fixing it means either
 * emitting the twelve computed sizes inline from `ThemeProvider` (the value is
 * already known there) or dropping the indirection; both are a real batch, so they
 * are filed instead of fixed here.
 */
const KNOWN_FONT_SCALE_DEBT = new Set([
  '--font-2xs',
  '--font-caption2',
  '--font-caption1',
  '--font-footnote',
  '--font-subhead',
  '--font-callout',
  '--font-body',
  '--font-headline',
  '--font-title3',
  '--font-title2',
  '--font-title1',
  '--font-largeTitle',
])

function cssFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) return cssFiles(full)
    return entry.endsWith('.css') ? [full] : []
  })
}

/** `--x: <value>` declarations, comments stripped so prose cannot be flagged. */
function customPropertyDeclarations(css: string): Array<{ name: string, value: string }> {
  const body = css.replace(/\/\*[\s\S]*?\*\//g, '')
  return [...body.matchAll(/(--[\w-]+)\s*:\s*([^;}]+)/g)].map((m) => ({
    name: m[1]!,
    value: m[2]!.trim(),
  }))
}

test('the inline token set is derived and non-empty', () => {
  const tokens = inlineOverriddenTokens()
  // Guards the derivation itself: if a provider changes shape and emits nothing,
  // every assertion below would pass by scanning against an empty set.
  expect(tokens.size).toBeGreaterThan(10)
  expect(tokens).toContain('--accent')
  expect(tokens).toContain('--font-scale')
  for (const v of Object.values(SAFE_AREA_VARS)) expect(tokens).toContain(v)
})

test('no calc-bearing custom property consumes an inline-overridden token', () => {
  const tokens = inlineOverriddenTokens()
  const violations: string[] = []
  const allowlisted = new Set<string>()

  for (const file of cssFiles(SRC)) {
    const css = readFileSync(file, 'utf8')
    for (const decl of customPropertyDeclarations(css)) {
      // Scoped to `calc()` because that is the shape actually measured to fail on
      // iOS (both known defects are calc-bearing). A *plain* substitution inside a
      // custom property — `--material-sheen-layer: … var(--material-sheen)`,
      // `--material-rim-sides: … var(--material-rim-side)` — is **unverified either way**
      // and deliberately not flagged: asserting it broken without measuring would be
      // the same mistake as the docs that claimed `env()` worked. Candidates listed
      // in `docs/project/bugs.md`; if one is ever measured to fail, widen this test.
      // (A third candidate, `--shadow-focus`, left this list in batch 68 by being
      // deleted: it had no consumer.)
      if (!decl.value.includes('calc(')) continue
      for (const m of decl.value.matchAll(/var\(\s*(--[\w-]+)/g)) {
        if (!tokens.has(m[1]!)) continue
        const where = `${path.relative(SRC, file)} ${decl.name} → var(${m[1]})`
        if (KNOWN_FONT_SCALE_DEBT.has(decl.name) && m[1] === '--font-scale') {
          allowlisted.add(decl.name)
        } else {
          violations.push(where)
        }
      }
    }
  }

  // The allowlist must stay honest: an entry no longer present in the tree means
  // the debt was paid (or the token renamed), and the entry should go with it.
  expect([...allowlisted].sort()).toEqual([...KNOWN_FONT_SCALE_DEBT].sort())

  expect(
    violations,
    'A calc() inside a custom property does not see an inline override of the '
    + 'token it references on iOS — it resolves against the stylesheet value, and '
    + 'if that is invalid (e.g. env()) the whole token becomes invalid at '
    + 'computed-value time, dropping every declaration that consumes it. Make the '
    + 'custom property a plain value and do the arithmetic at the use site.',
  ).toEqual([])
})

test('the safe-area tokens are consumed directly, never through a custom property', () => {
  // Narrower restatement of the rule above for the tokens this repo just added,
  // so that if the derivation ever stops covering them this still holds.
  for (const file of cssFiles(SRC)) {
    const css = readFileSync(file, 'utf8')
    for (const decl of customPropertyDeclarations(css)) {
      for (const v of Object.values(SAFE_AREA_VARS)) {
        expect(
          decl.value.includes(v),
          `${path.relative(SRC, file)}: ${decl.name} nests ${v}`,
        ).toBe(false)
      }
    }
  }
})
