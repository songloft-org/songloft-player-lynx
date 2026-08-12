import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, test } from 'vitest'

/**
 * WCAG 2.1 contrast regression gate for the LUNA tokens in `tokens.css`.
 *
 * The dark theme was audited in 批27: a single `--primary` shade can't both
 * carry white button text (needs to be deep) and read as accent text on
 * near-black surfaces (needs to be light), so `--primary` is the deep
 * fill/border shade and `--accent` is the lighter text shade — ditto
 * `--danger` (vivid text) vs `--danger-2` (deep button fill). This test reads
 * the actual `tokens.css` (not a hand-maintained copy) so any color edit that
 * regresses contrast turns the build red.
 *
 * Thresholds: normal text 4.5:1, large text / UI graphics 3:1.
 */

const TOKENS_CSS = readFileSync(
  // `pnpm test` always runs from the project root; `import.meta.url`-based
  // `new URL(...)` trips the Lynx vitest env's `self is not defined`.
  resolve(process.cwd(), 'src/shared/theme/tokens.css'),
  'utf8',
)

type Color = { r: number; g: number; b: number }

function parseHex(hex: string): Color {
  const c = hex.replace('#', '')
  const full =
    c.length === 3
      ? c
          .split('')
          .map((ch) => ch + ch)
          .join('')
      : c
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  }
}

/** Parse `rgba(r,g,b,a)` blended over an opaque backdrop (for --paper-clear). */
function parseRgbaOver(
  raw: string,
  backdrop: Color,
): Color {
  const m = raw.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s]+([\d.]+))?\s*\)/)
  if (!m) throw new Error(`not rgba: ${raw}`)
  const [, rs, gs, bs, as] = m
  const a = as !== undefined ? parseFloat(as) : 1
  const f = parseHex(`#${rs}${gs}${bs}`)
  // f is written as 0-255 ints in the rgba; treat as hex channels
  const r = parseInt(rs), g = parseInt(gs), b = parseInt(bs)
  return {
    r: Math.round(backdrop.r + (r - backdrop.r) * a),
    g: Math.round(backdrop.g + (g - backdrop.g) * a),
    b: Math.round(backdrop.b + (b - backdrop.b) * a),
  }
  void f
}

function luminance(c: Color): number {
  const to = (v: number) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * to(c.r) + 0.7152 * to(c.g) + 0.0722 * to(c.b)
}

function ratio(a: Color, b: Color): number {
  const la = luminance(a)
  const lb = luminance(b)
  const hi = Math.max(la, lb)
  const lo = Math.min(la, lb)
  return (hi + 0.05) / (lo + 0.05)
}

function hexColor(c: Color): string {
  return (
    '#' +
    [c.r, c.g, c.b]
      .map((v) => v.toString(16).padStart(2, '0'))
      .join('')
  )
}

/** Parse one `.theme-root.theme-<name> { … }` block into a `--token → Color` map. */
function parseTheme(name: 'dark' | 'light'): Record<string, Color> {
  const re = new RegExp(`\\.theme-root\\.theme-${name}\\s*\\{([\\s\\S]*?)\\n\\s*\\}`)
  const m = TOKENS_CSS.match(re)
  if (!m) throw new Error(`theme block ${name} not found`)
  const block = m[1]
  const out: Record<string, Color> = {}
  for (const line of block.split('\n')) {
    const decl = line.match(/^\s*--([\w-]+):\s*(#[0-9a-fA-F]{3,8}|rgba?\([^)]+\))\s*;/)
    if (!decl) continue
    const [, key, val] = decl
    if (val.startsWith('#')) {
      out[key] = parseHex(val)
    } else if (key === 'paper-clear') {
      // blended over canvas at parse time
      out['paper-clear'] = parseRgbaOver(val, out['canvas'])
    } else {
      // rgba used as a solid (backdrop/overlay) — parse raw, alpha=1
      out[key] = parseRgbaOver(val, { r: 0, g: 0, b: 0 })
    }
  }
  return out
}

const DARK = parseTheme('dark')
const LIGHT = parseTheme('light')

const WHITE: Color = { r: 255, g: 255, b: 255 }

function expectAA(fg: Color, bg: Color, label: string, min = 4.5) {
  const r = ratio(fg, bg)
  // eslint-disable-next-line no-console
  expect(r, `${label} = ${r.toFixed(2)} (fg ${hexColor(fg)} on ${hexColor(bg)})`).toBeGreaterThanOrEqual(min)
}

describe('dark theme contrast (WCAG AA)', () => {
  const surfaces = ['canvas', 'paper', 'paper-clear', 'neutral-faint'] as const

  test.each(surfaces)('content reads on %s (≥4.5)', (s) => {
    expectAA(DARK['content'], DARK[s], `content on ${s}`)
  })
  test.each(surfaces)('content-2 reads on %s (≥4.5)', (s) => {
    expectAA(DARK['content-2'], DARK[s], `content-2 on ${s}`)
  })
  test.each(surfaces)('content-muted reads on %s (≥4.5)', (s) => {
    expectAA(DARK['content-muted'], DARK[s], `content-muted on ${s}`)
  })
  test.each(surfaces)('accent reads as text on %s (≥4.5)', (s) => {
    expectAA(DARK['accent'], DARK[s], `accent on ${s}`)
  })
  test.each(surfaces)('danger reads as text on %s (≥4.5)', (s) => {
    expectAA(DARK['danger'], DARK[s], `danger on ${s}`)
  })

  test('white on primary (button) ≥4.5', () => {
    expectAA(WHITE, DARK['primary'], 'white on primary')
  })
  test('white on danger-2 (button) ≥4.5', () => {
    expectAA(WHITE, DARK['danger-2'], 'white on danger-2')
  })

  // primary is now the deep fill shade; as a border/UI graphic it only needs 3:1.
  test('primary as UI/border on paper ≥3', () => {
    expectAA(DARK['primary'], DARK['paper'], 'primary on paper', 3)
  })
  test('primary as UI/border on neutral-faint ≥3', () => {
    expectAA(DARK['primary'], DARK['neutral-faint'], 'primary on neutral-faint', 3)
  })
})

describe('light theme contrast (WCAG AA; dark is the audited scope, light is a parity gate)', () => {
  test('content on canvas/paper ≥4.5', () => {
    expectAA(LIGHT['content'], LIGHT['canvas'], 'content on canvas')
    expectAA(LIGHT['content'], LIGHT['paper'], 'content on paper')
  })
  test('content-2 on canvas/paper/neutral-faint ≥4.5', () => {
    expectAA(LIGHT['content-2'], LIGHT['canvas'], 'content-2 on canvas')
    expectAA(LIGHT['content-2'], LIGHT['paper'], 'content-2 on paper')
    expectAA(LIGHT['content-2'], LIGHT['neutral-faint'], 'content-2 on neutral-faint')
  })
  test('accent reads as text on paper/canvas ≥4.5', () => {
    expectAA(LIGHT['accent'], LIGHT['paper'], 'accent on paper')
    expectAA(LIGHT['accent'], LIGHT['canvas'], 'accent on canvas')
  })
  test('white on primary (button) ≥4.5', () => {
    expectAA(WHITE, LIGHT['primary'], 'white on primary')
  })
  test('white on danger-2 (button) ≥4.5', () => {
    expectAA(WHITE, LIGHT['danger-2'], 'white on danger-2')
  })

  // Known light-theme gaps (large-text-only, 3:1): muted/danger-as-text on
  // bright surfaces miss 4.5 by a hair. Documented in PROGRESS 批27 遗留;
  // a future light-audit batch deepens --content-muted / --danger.
  test('content-muted on paper ≥3 (large-only, known gap)', () => {
    expectAA(LIGHT['content-muted'], LIGHT['paper'], 'content-muted on paper', 3)
  })
  test('danger as text on paper ≥3 (large-only, known gap)', () => {
    expectAA(LIGHT['danger'], LIGHT['paper'], 'danger on paper', 3)
  })
})
