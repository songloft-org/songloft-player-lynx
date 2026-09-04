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
    '--font-caption2': 'calc(11px * var(--font-scale))',
    '--font-caption1': 'calc(12px * var(--font-scale))',
    '--font-footnote': 'calc(13px * var(--font-scale))',
    '--font-subhead': 'calc(15px * var(--font-scale))',
    '--font-callout': 'calc(16px * var(--font-scale))',
    '--font-body': 'calc(17px * var(--font-scale))',
    '--font-headline': 'calc(17px * var(--font-scale))',
    '--font-title3': 'calc(20px * var(--font-scale))',
    '--font-title2': 'calc(22px * var(--font-scale))',
    '--font-title1': 'calc(28px * var(--font-scale))',
    '--font-largeTitle': 'calc(34px * var(--font-scale))',
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
  // --shadow-focus resolves --tint-fill at use time, so the literal is kept
  // verbatim — the theme-layer resolution is covered by the Docker-Chrome
  // runtime check, not by static text matching.
  expect(decl['--shadow-focus']).toBe('0 0 0 3px var(--tint-fill)')
})

test('the Apple grouped-list corner is its own token, not --radius-sm', () => {
  // 10pt is Apple's inset-grouped cell radius. Keeping it separate from
  // --radius-sm (8px) is what lets the two be retuned independently — the
  // settings cards and a badge are not the same shape decision.
  expect(decl['--radius-grouped']).toBe('10px')
  expect(decl['--radius-sm']).not.toBe(decl['--radius-grouped'])
})

test('HIG §12.2 control / tap-target sizes are declared', () => {
  expect(decl['--tap-target']).toBe('44px')
  expect(decl['--tap-target-min']).toBe('28px')
  expect(decl['--control-height']).toBe('44px')
  expect(decl['--control-height-sm']).toBe('36px')
})

test('--font-2xs is kept; the other legacy sizes are gone (font-role sweep)', () => {
  // --font-2xs is the ONE legacy size kept (the bottom-nav tab label, AGENTS
  // freeze). The rest (xs/sm/md/lg/xl/2xl) were deleted once the font-role
  // sweep migrated every consumer to an Apple HIG text style by semantic role.
  expect(decl['--font-2xs'], '--font-2xs (kept, frozen)').toBe(
    'calc(10px * var(--font-scale))',
  )
  for (const name of ['--font-xs', '--font-sm', '--font-md', '--font-lg', '--font-xl', '--font-2xl']) {
    expect(decl[name], `${name} must NOT be re-declared (font-role sweep deleted it)`).toBeUndefined()
  }
})

/**
 * Apple semantic colours, pinned per theme.
 *
 * This block exists for the reason stated at the top of the file: Lynx drops an
 * unrecognised custom-property declaration SILENTLY. A token misspelled in
 * `tokens.css` does not warn, does not fall back visibly, and does not fail any
 * render test — the element simply inherits. Every semantic colour therefore has
 * to be named here, or its existence is unverified.
 *
 * PROVENANCE, because it decides how much these values can be trusted:
 *
 *  - systemBlue and systemRed (and the six-step grey ladder with its
 *    Increased-Contrast variants) are VERIFIED against Apple's own published
 *    swatches — the HIG's colour page carries them as images whose `alt` text
 *    is the literal RGB triple. They were fetched and diffed, and several of the
 *    values previously carried here were the PRE-2025 ones: Apple's "June 9,
 *    2025 — Updated system color values" revision moved systemBlue from
 *    #007aff/#0a84ff to #0088ff/#0091ff and systemRed from #ff3b30/#ff453a to
 *    #ff383c/#ff4245.
 *  - systemGreen is verified against the same swatches.
 *  - The remaining six tints (orange/yellow/pink/purple/indigo/teal) are the
 *    LONG-STABLE canonical iOS values (unchanged since iOS 13). Apple's June
 *    2025 release notes do not list any of them as changed, and they were
 *    re-verified 2026-09 against the community-reported values Apple's UIColor
 *    resolves to (Apple does not publish exact hex for dynamic system colours
 *    at all). They carry the same "re-check on next OS release" flag as
 *    everything else here, because the only true verification is runtime
 *    resolvedColor — which Lynx has no API to call. These six are used ONLY as
 *    decorative row-icon tile fills (white glyph + a title label that carries
 *    the meaning), so a small drift would have no legibility consequence.
 *  - The label, background, fill and separator tiers are NOT published numerically by
 *    Apple anywhere; DESIGN.md §3.3 records why ("文档中的颜色值仅供设计参考"). Those
 *    values come from the design resources and are corroborated where possible: the
 *    background tiers coincide with the verified grey ladder (light
 *    secondarySystemBackground = systemGray6 = #f2f2f7, dark = #1c1c1e, dark tertiary
 *    = systemGray5 = #2c2c2e), which is as close to verification as they get.
 *
 * Where an Apple value costs contrast the number is recorded in `tokens.css` next to
 * the token and enforced (or deliberately not enforced) by `contrast.test.ts`; this
 * gate is about identity, not legibility.
 */
function themeDeclarations(theme: 'light' | 'dark'): Record<string, string> {
  const block = TOKENS.match(
    new RegExp(`\\.theme-root\\.theme-${theme}\\s*\\{([\\s\\S]*?)\\n\\s*\\}`),
  )
  expect(block, `.theme-root.theme-${theme} block exists`).not.toBeNull()
  return parseDeclarations(block![1]!)
}

const APPLE_COLORS = {
  light: {
    '--label': '#000000',
    '--secondary-label': 'rgba(60, 60, 67, 0.6)',
    '--tertiary-label': 'rgba(60, 60, 67, 0.3)',
    '--quaternary-label': 'rgba(60, 60, 67, 0.18)',
    '--placeholder-text': 'rgba(60, 60, 67, 0.3)',
    '--system-background': '#ffffff',
    '--secondary-system-background': '#f2f2f7',
    '--tertiary-system-background': '#ffffff',
    '--system-grouped-background': '#f2f2f7',
    '--secondary-system-grouped-background': '#ffffff',
    '--tertiary-system-grouped-background': '#f2f2f7',
    '--system-fill': 'rgba(120, 120, 128, 0.2)',
    '--secondary-system-fill': 'rgba(120, 120, 128, 0.16)',
    '--tertiary-system-fill': 'rgba(118, 118, 128, 0.12)',
    '--quaternary-system-fill': 'rgba(116, 116, 128, 0.08)',
    '--separator': 'rgba(60, 60, 67, 0.29)',
    '--opaque-separator': '#c6c6c8',
    '--accent': '#0088ff',
    '--accent-content': '#ffffff',
    '--tint-fill': 'rgba(0, 136, 255, 0.1)',
    '--system-red': '#ff383c',
    '--system-red-strong': '#e9152d',
    '--system-red-strong-content': '#ffffff',
    '--system-green': '#34c759',
    '--system-orange': '#ff9500',
    '--system-yellow': '#ffcc00',
    '--system-pink': '#ff2d55',
    '--system-purple': '#af52de',
    '--system-indigo': '#5856d6',
    '--system-teal': '#30b0c7',
    '--system-gray': '#8e8e93',
    '--system-gray2': '#aeaeb2',
    '--system-gray3': '#c7c7cc',
    '--system-gray4': '#d1d1d6',
    '--system-gray5': '#e5e5ea',
    '--system-gray6': '#f2f2f7',
  },
  dark: {
    '--label': '#ffffff',
    '--secondary-label': 'rgba(235, 235, 245, 0.6)',
    '--tertiary-label': 'rgba(235, 235, 245, 0.3)',
    '--quaternary-label': 'rgba(235, 235, 245, 0.16)',
    '--placeholder-text': 'rgba(235, 235, 245, 0.3)',
    '--system-background': '#000000',
    '--secondary-system-background': '#1c1c1e',
    '--tertiary-system-background': '#2c2c2e',
    '--system-grouped-background': '#000000',
    '--secondary-system-grouped-background': '#1c1c1e',
    '--tertiary-system-grouped-background': '#2c2c2e',
    '--system-fill': 'rgba(120, 120, 128, 0.36)',
    '--secondary-system-fill': 'rgba(120, 120, 128, 0.32)',
    '--tertiary-system-fill': 'rgba(118, 118, 128, 0.24)',
    '--quaternary-system-fill': 'rgba(118, 118, 128, 0.18)',
    '--separator': 'rgba(84, 84, 88, 0.65)',
    '--opaque-separator': '#38383a',
    '--accent': '#0091ff',
    '--accent-content': '#ffffff',
    '--tint-fill': 'rgba(0, 145, 255, 0.18)',
    '--system-red': '#ff4245',
    '--system-red-strong': '#e9152d',
    '--system-red-strong-content': '#ffffff',
    '--system-green': '#30d158',
    '--system-orange': '#ff9f0a',
    '--system-yellow': '#ffd60a',
    '--system-pink': '#ff375f',
    '--system-purple': '#bf5af2',
    '--system-indigo': '#5e5ce6',
    '--system-teal': '#40c8e0',
    '--system-gray': '#8e8e93',
    '--system-gray2': '#636366',
    '--system-gray3': '#48484a',
    '--system-gray4': '#3a3a3c',
    '--system-gray5': '#2c2c2e',
    '--system-gray6': '#1c1c1e',
  },
} as const

for (const theme of ['light', 'dark'] as const) {
  test(`${theme}: every Apple semantic colour is declared with its Apple value`, () => {
    const decl = themeDeclarations(theme)
    for (const [name, value] of Object.entries(APPLE_COLORS[theme])) {
      expect(decl[name], `${name} declared in .theme-${theme}`).toBeDefined()
      expect(decl[name], `${name} in .theme-${theme}`).toBe(value)
    }
  })
}

test('the two background groups differ in light and collapse in dark', () => {
  // This is the structural fact that made six background tokens necessary rather
  // than three, and the single most visible change from the former palette. If a
  // future edit flattens it, the grouped screens silently stop being grouped.
  const light = themeDeclarations('light')
  const dark = themeDeclarations('dark')

  expect(light['--system-background'], 'light plain page is white')
    .not.toBe(light['--system-grouped-background'])
  expect(light['--secondary-system-background'], 'light plain card is grey')
    .not.toBe(light['--secondary-system-grouped-background'])
  // …and the relationship is INVERTED, not merely different: the grouped page
  // wears the plain card's colour and vice versa.
  expect(light['--system-grouped-background']).toBe(light['--secondary-system-background'])
  expect(light['--secondary-system-grouped-background']).toBe(light['--system-background'])

  expect(dark['--system-background'], 'dark collapses both page tiers to black')
    .toBe(dark['--system-grouped-background'])
  expect(dark['--secondary-system-background'])
    .toBe(dark['--secondary-system-grouped-background'])
})

/**
 * The former Muse colour aliases, deleted in P10. The list is written out
 * rather than derived so a reintroduced alias is caught even if it points at a
 * real token (an alias that resolves correctly still fails the gate — the
 * bridge is gone on purpose). This is the hard checkpoint the plan promised:
 * it only passes once P1–P9 drove every consumer to zero.
 */
const DELETED_MUSE_ALIASES = [
  '--canvas', '--paper', '--paper-clear',
  '--content', '--content-2', '--content-muted',
  '--primary', '--primary-content', '--primary-faint',
  '--danger', '--danger-content', '--danger-2',
  '--neutral-faint', '--line', '--rule', '--fill-faint',
] as const

test('the Muse colour-alias bridge is gone (P10)', () => {
  /*
   * The aliases were indirections (`--content: var(--label)`) that let the
   * migration land screen by screen. P10 deleted them once every CSS consumer
   * was on the real token. A reintroduction — even one that points at the
   * correct Apple token — re-opens a parallel naming layer the migration
   * deliberately collapsed, so it fails here regardless of what it resolves to.
   */
  for (const theme of ['light', 'dark'] as const) {
    const decl = themeDeclarations(theme)
    for (const name of DELETED_MUSE_ALIASES) {
      expect(decl[name], `${name} must NOT be re-declared in .theme-${theme} (P10 deleted it)`)
        .toBeUndefined()
    }
    // The base theme block is now all literals — no `var()` indirections. (The
    // increase-contrast blocks still carry `--separator: var(--opaque-separator)`,
    // but those are a different selector, parsed separately.) This catches any
    // NEW alias invented under a name not in the list above.
    const indirections = Object.entries(decl)
      .filter(([, value]) => value.startsWith('var('))
      .map(([name]) => name)
    expect(indirections, `.theme-${theme} must carry no var() indirections`).toEqual([])
  }
})

test('increase-contrast raises what Apple leaves below AA, per theme', () => {
  /*
   * Shipping Apple's palette verbatim leaves systemBlue-as-text at 4.02 and light
   * secondaryLabel at 3.44. This variant is the mitigation, so its existence is
   * gated rather than assumed.
   *
   * The asymmetry is the point and is asserted: light must deepen its secondary
   * label (0.60 clears only 3.0 there), dark must not bother (0.60 already
   * measures 5.27–6.36). And the dark accent must flip --accent-content to black —
   * white on #409cff is 2.83, so a brighter accent moves the label too.
   */
  function variant(theme: 'light' | 'dark'): Record<string, string> {
    const block = TOKENS.match(
      new RegExp(`\\.theme-root\\.theme-${theme}\\.increase-contrast\\s*\\{([\\s\\S]*?)\\n\\s*\\}`),
    )
    expect(block, `.theme-root.theme-${theme}.increase-contrast exists`).not.toBeNull()
    return parseDeclarations(block![1]!)
  }

  const light = variant('light')
  expect(light['--accent']).toBe('#1e6ef4')
  expect(light['--secondary-label']).toBe('rgba(60, 60, 67, 0.73)')
  expect(light['--tertiary-label']).toBe('rgba(60, 60, 67, 0.57)')
  expect(light['--system-red']).toBe('#e9152d')
  expect(light['--separator']).toBe('var(--opaque-separator)')
  // Apple's accessible grey ladder, not a rescaling of the default one.
  expect(light['--system-gray']).toBe('#6c6c70')
  expect(light['--system-gray6']).toBe('#ebebf0')

  const dark = variant('dark')
  expect(dark['--accent']).toBe('#5cb8ff')
  expect(dark['--accent-content'], 'white on #5cb8ff is 2.15 — the label must flip')
    .toBe('#000000')
  expect(dark['--system-gray']).toBe('#aeaeb2')
  expect(dark['--system-gray6']).toBe('#242426')
  expect(dark['--tertiary-label']).toBe('rgba(235, 235, 245, 0.38)')
  expect(dark['--separator']).toBe('var(--opaque-separator)')
  expect(dark['--secondary-label'], 'dark already clears AA at 0.60 — leave it alone')
    .toBeUndefined()
})
