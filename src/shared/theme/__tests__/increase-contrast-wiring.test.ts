import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

import { expect, test } from 'vitest'

import { createMemoryStorage } from '../../../core/storage/index.js'
import { changeIncreaseContrast } from '../increase-contrast-model.js'
import { CONTRAST_ACCENT, PACK_OVERRIDABLE_BASELINE, themePackToStyleVars } from '../theme-pack-mapping.js'

/**
 * Increase-Contrast wiring gate.
 *
 * `.increase-contrast` is the third instance in this repo of styles that were
 * authored, documented and then never switched on: the CSS landed with the
 * Apple Design System migration (batch P…), the comment said activation was
 * waiting on a native field, and nothing ever added the class. The other two
 * were the `:active` press states (batch 64) and `--shadow-focus` — the latter
 * turned out to have no reachable consumer at all and was deleted in batch 68
 * rather than wired.
 *
 * `increase-contrast-model.test.ts` proves the flag and the pref behave;
 * `theme-provider.test.tsx` proves the class reaches the root. This file guards
 * the parts that can be deleted without either of those failing — the CSS the
 * class depends on, the two consumers that make it reachable, the startup
 * replay that makes it survive a restart, and the **inline channel**, which is
 * where the accent has to live because a class declaration cannot outrank the
 * baseline written on the same element. A model with no consumer is not a
 * shipped feature (AGENTS §5.3).
 *
 * Assertions are structural, not substring: comments are stripped first, so the
 * prose above a rule cannot stand in for the rule.
 */

const SRC = path.resolve(__dirname, '../../../..')

function source(rel: string): string {
  return readFileSync(path.join(SRC, rel), 'utf8')
    // Block comments carry most of the prose in this repo; line comments carry
    // the rest. `//` is only stripped at line start so a `https://` inside a
    // string literal cannot swallow the code after it.
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '')
}

/** The declaration body of the rule whose selector opens at its first match. */
function ruleBody(css: string, selector: string): string {
  // The selector has to OPEN a rule, not merely prefix one. A plain `indexOf`
  // accepts `.increase-contrast-GONE {` as `.increase-contrast` — the substring
  // trap these gates exist to avoid (AGENTS §5.3), and one this file actually
  // fell into before the reverse-verification caught it.
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = new RegExp(`${escaped}\\s*\\{`).exec(css)
  expect(match, `${selector} is missing from tokens.css`).not.toBeNull()

  const open = match!.index + match![0].length - 1
  const close = css.indexOf('}', open)
  expect(close, `${selector} declaration block is unterminated`).toBeGreaterThan(open)
  return css.slice(open + 1, close)
}

/** Custom-property names declared in a rule body. */
function declaredKeys(body: string): string[] {
  return [...body.matchAll(/(--[a-z0-9-]+)\s*:/gi)].map((m) => m[1]!)
}

/* ── The class has something to switch on ──────────────────────────────────── */

test('tokens.css still declares a per-theme increase-contrast palette', () => {
  const css = source('src/shared/theme/tokens.css')

  for (const theme of ['light', 'dark']) {
    // Three classes deep on purpose: the theme scope is what lets it win over
    // the theme block on specificity rather than source order. A bare
    // `.increase-contrast` rule would be a different (fragile) mechanism.
    const body = ruleBody(css, `.theme-root.theme-${theme}.increase-contrast`)

    // The opaque separator is what the Settings subtitle promises the user.
    expect(body, `${theme} block does not restore an opaque --separator`)
      .toMatch(/--separator\s*:\s*var\(--opaque-separator\)/)

    // ...and the accent must NOT be here. It is in the channel that
    // `PACK_OVERRIDABLE_BASELINE` occupies — inline, on the same element — and
    // inline beats a class declaration, so a rule here is dead on arrival. That
    // is measured rather than theorised: with the switch on, the accent badge
    // stayed `#0088ff` while `--separator` in this very block did change.
    expect(body, `${theme} block declares --accent, which the inline baseline outranks`)
      .not.toMatch(/--accent/)
  }
})

test('no token is declared in both contrast channels', () => {
  const css = source('src/shared/theme/tokens.css')

  for (const theme of ['light', 'dark'] as const) {
    const body = ruleBody(css, `.theme-root.theme-${theme}.increase-contrast`)
    const classKeys = declaredKeys(body)
    const inlineKeys = Object.keys(PACK_OVERRIDABLE_BASELINE[theme])

    // Both sides live in this file on purpose: the invariant is *between* the
    // stylesheet and the inline table, and neither file can check it alone.
    expect(
      classKeys.filter((key) => inlineKeys.includes(key)),
      'a contrast token declared in BOTH channels is dead in the class one (the '
      + 'inline baseline is on the same element and wins). Move it to '
      + 'CONTRAST_ACCENT, or take it out of PACK_OVERRIDABLE_BASELINE.',
    ).toEqual([])
  }
})

/* ── The one token that had to move: the accent, through the inline channel ── */

test("Apple's accessible accent reaches the inline channel, and a pack keeps its own", async () => {
  expect(CONTRAST_ACCENT.light).toEqual({ accent: '#1e6ef4', accentContent: '#ffffff' })
  expect(CONTRAST_ACCENT.dark, 'white on #5cb8ff is 2.15 — the label must flip')
    .toEqual({ accent: '#5cb8ff', accentContent: '#000000' })

  const storage = createMemoryStorage()

  // OFF (the default) is the untouched baseline.
  expect(themePackToStyleVars(null, 'light')['--accent']).toBe('#0088ff')

  try {
    await changeIncreaseContrast(true, storage)

    expect(
      themePackToStyleVars(null, 'light')['--accent'],
      'the switch does not reach the style object — this is exactly the failure '
      + 'the class channel had: a value that exists and never wins',
    ).toBe('#1e6ef4')
    expect(themePackToStyleVars(null, 'dark')['--accent']).toBe('#5cb8ff')
    expect(themePackToStyleVars(null, 'dark')['--accent-content']).toBe('#000000')

    // A pack is the user's explicit choice in Settings — the accessibility
    // switch must not repaint it (see CONTRAST_ACCENT).
    const pack = {
      id: 'p', name: 'P', author: 'a', description: '', version: '1', schemaVersion: 1,
      light: { seedColor: '#ff0000' },
    }
    expect(
      themePackToStyleVars(pack, 'light')['--accent'],
      'the pack lost the accent to the accessibility switch',
    ).toBe('#ff0000')
  } finally {
    // The flag is module state: leaving it on would leak into every later test.
    await changeIncreaseContrast(false, storage)
  }

  expect(themePackToStyleVars(null, 'light')['--accent']).toBe('#0088ff')
})

/* ── ThemeProvider is what puts it on the root ─────────────────────────────── */

test('ThemeProvider adds the class conditionally and subscribes to the model', () => {
  const tsx = source('src/shared/theme/ThemeProvider.tsx')

  expect(tsx, 'ThemeProvider no longer reads the app switch')
    .toMatch(/useSurfaceAppearance/)

  const additions = tsx.match(/' increase-contrast'/g) ?? []
  expect(additions, 'expected exactly one place that adds the class').toHaveLength(1)

  // Conditional, with an empty false branch: the default look must be the
  // *absence* of the class, never `increase-contrast` plus a counter-rule.
  expect(
    tsx,
    "' increase-contrast' must be gated on the flag (ternary with an empty else)",
  ).toMatch(/\?\s*'\sincrease-contrast'\s*:\s*''/)

  // Without the subscription a flip from the Settings page would never reach an
  // already-mounted tree — the class would only appear after a relaunch.
  expect(
    source('src/shared/theme/surface-appearance.ts'),
    'ThemeProvider must subscribe, or the Settings switch only applies next launch',
  ).toMatch(/subscribeSurfacePolicy\(/)
})

/* ── The user can reach it ─────────────────────────────────────────────────── */

test('Appearance settings render a switch wired to the model', () => {
  const page = source('src/features/settings/pages/AppearancePage.tsx')

  expect(page, 'the appearance page no longer imports the app switch')
    .toMatch(/changeIncreaseContrast/)

  const switchAt = page.indexOf("testId='increase-contrast'")
  expect(switchAt, 'no increase-contrast SwitchRow on the appearance page').toBeGreaterThan(-1)

  // The wiring has to be the row's own, not just something nearby: walk back to
  // the opening tag and require it to carry both the checked value and the
  // handler. A `SwitchRow` rendered with only one of the two is a dead toggle.
  const tagStart = page.lastIndexOf('<SwitchRow', switchAt)
  expect(tagStart, 'testId is not on a SwitchRow').toBeGreaterThan(-1)
  const tag = page.slice(tagStart, switchAt)

  expect(tag, 'the switch is not bound to the live flag').toMatch(/checked=\{increaseContrast\}/)
  expect(tag, 'the switch has no handler — tapping it would do nothing')
    .toMatch(/onChange=\{toggleIncreaseContrast\}/)
})

/* ── It survives a restart ─────────────────────────────────────────────────── */

test('startup replays the persisted switch', () => {
  expect(
    source('src/index.tsx'),
    'applySavedIncreaseContrast is not awaited at startup — the preference would '
    + 'only come back the next time the user opened the settings page',
  ).toMatch(/await applySavedIncreaseContrast\(\)/)
})

/* ── And it is actually consumed outside its own file ──────────────────────── */

test('the model has non-test consumers', () => {
  const consumers = new Set<string>()

  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      if (entry === 'node_modules' || entry === '__tests__') continue
      const full = path.join(dir, entry)
      if (statSync(full).isDirectory()) {
        walk(full)
        continue
      }
      if (!/\.tsx?$/.test(entry)) continue
      if (readFileSync(full, 'utf8').includes('increase-contrast-model.js')) {
        consumers.add(path.relative(SRC, full).replaceAll(path.sep, '/'))
      }
    }
  }
  walk(path.join(SRC, 'src'))

  expect(
    [...consumers].sort(),
    'the increase-contrast model is imported only by its own tests — the class '
    + 'would never be switched on',
  ).toEqual([
    'src/features/settings/pages/AppearancePage.tsx',
    'src/index.tsx',
    'src/shared/theme/surface-policy.ts',
    // The inline channel: it has to read the flag to move the accent, because no
    // class declaration can outrank the baseline written on the same element.
    'src/shared/theme/theme-pack-mapping.ts',
  ])
})
