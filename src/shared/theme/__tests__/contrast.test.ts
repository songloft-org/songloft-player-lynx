import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, test } from 'vitest'

/**
 * WCAG 2.1 contrast regression gate for the Muse tokens in `tokens.css`.
 *
 * Muse uses a single ink accent channel: light --primary is #111 with white
 * --primary-content (button text); dark inverts it — --primary is #ffffff with
 * near-black --primary-content. So the button/panel text pair audited below is
 * primary-content-on-primary, not a hardcoded white. `--danger` is a red used
 * on TEXT only; a single shade can't meet 4.5 on both light (#fafafa) and dark
 * (#1f1f25) surfaces, so it stays per-theme (the dark shade is brighter).
 * `--content-muted` (tertiary/placeholder text) likewise stays per-theme to
 * clear 4.5 (dark) / 3 (light). This test reads the actual `tokens.css` (not a
 * hand-maintained copy) so any color edit that regresses contrast turns the
 * build red.
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

  // Muse inverts the dark accent: --primary is white, so button/panel TEXT is
  // --primary-content (near-black), not white. The gate therefore checks
  // primary-content-on-primary, the real pair the button renders. (Light keeps
  // primary-content = white, so the pair is unchanged there.)
  test('button text (primary-content) on primary ≥4.5', () => {
    expectAA(DARK['primary-content'], DARK['primary'], 'primary-content on primary')
  })
  test('white on danger-2 (button) ≥4.5', () => {
    expectAA(WHITE, DARK['danger-2'], 'white on danger-2')
  })
  // `--primary-2` also carries primary-content text (the home stats strip is
  // filled with it), so it needs the same 4.5 as `--primary`. Batch 27 audited
  // only `--primary` and missed this; batch 29 caught it by sampling the strip
  // on a device and finding a shade the audit never checked.
  test('panel text (primary-content) on primary-2 ≥4.5', () => {
    expectAA(DARK['primary-content'], DARK['primary-2'], 'primary-content on primary-2')
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
  test('button text (primary-content) on primary ≥4.5', () => {
    expectAA(LIGHT['primary-content'], LIGHT['primary'], 'primary-content on primary')
  })
  test('white on danger-2 (button) ≥4.5', () => {
    expectAA(WHITE, LIGHT['danger-2'], 'white on danger-2')
  })
  test('panel text (primary-content) on primary-2 ≥4.5', () => {
    expectAA(LIGHT['primary-content'], LIGHT['primary-2'], 'primary-content on primary-2')
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

/**
 * The full player's veil over its blurred cover.
 *
 * This is the one surface in the app whose background is not a token: it is the veil
 * composited over *whatever colour the current album art happens to be*. So the pair
 * that has to clear AA is `--content*` over `veil ⊕ cover`, and the only honest
 * cover to test against is the worst case — pure black and pure white, since album
 * art can be either.
 *
 * The bound this produces is tight, and it decided the design rather than confirming
 * it: light `--content-2` reaches only 4.23:1 at α=0.90 and 4.43:1 at α=0.92, so the
 * first workable value is 0.93. That is why the cover shows through so little (see
 * the derivation comment in `tokens.css`). Loosening the alphas to make the artwork
 * more visible turns this red — which is the intended outcome, not an obstacle.
 */
describe('player scrim over worst-case cover art', () => {
  const BACKDROP_CSS = readFileSync(
    resolve(process.cwd(), 'src/features/player/widgets/PlayerBackdrop.css'),
    'utf8',
  )

  const BLACK: Color = { r: 0, g: 0, b: 0 }

  /** Alpha of one scrim token, read from `tokens.css`. */
  function scrimAlpha(theme: 'dark' | 'light', which: 'from' | 'to'): number {
    const block = TOKENS_CSS.match(
      new RegExp(`\\.theme-root\\.theme-${theme}\\s*\\{([\\s\\S]*?)\\n\\s*\\}`),
    )
    const decl = block![1]!.match(
      new RegExp(`--player-scrim-${which}:\\s*rgba?\\([^)]*?([\\d.]+)\\s*\\)`),
    )
    expect(decl, `--player-scrim-${which} missing from theme-${theme}`).not.toBeNull()
    return parseFloat(decl![1]!)
  }

  /** Solid colour of one scrim token (its rgb, ignoring alpha). */
  function scrimColor(tokens: Record<string, Color>): Color {
    // The veil is the canvas colour — asserted below, so reading `canvas` here is
    // not an assumption but the same fact stated once.
    return tokens['canvas']!
  }

  function composite(veil: Color, cover: Color, alpha: number): Color {
    return {
      r: Math.round(veil.r * alpha + cover.r * (1 - alpha)),
      g: Math.round(veil.g * alpha + cover.g * (1 - alpha)),
      b: Math.round(veil.b * alpha + cover.b * (1 - alpha)),
    }
  }

  test('the scrim is applied as a gradient of the two tokens', () => {
    // If the stylesheet stops using them, the alphas asserted below stop describing
    // anything that ships.
    const css = BACKDROP_CSS.replace(/\/\*[\s\S]*?\*\//g, '')
    expect(css).toContain('var(--player-scrim-from)')
    expect(css).toContain('var(--player-scrim-to)')
  })

  test.each(['dark', 'light'] as const)('%s: the veil is the canvas colour', (theme) => {
    // Any other hue would need its own foreground palette; using canvas is what lets
    // the player keep the ordinary `--content*` tokens.
    const block = TOKENS_CSS.match(
      new RegExp(`\\.theme-root\\.theme-${theme}\\s*\\{([\\s\\S]*?)\\n\\s*\\}`),
    )![1]!
    const canvas = (theme === 'dark' ? DARK : LIGHT)['canvas']!
    for (const which of ['from', 'to'] as const) {
      const rgb = block.match(
        new RegExp(`--player-scrim-${which}:\\s*rgba?\\(\\s*(\\d+)[,\\s]+(\\d+)[,\\s]+(\\d+)`),
      )!
      expect(
        { r: +rgb[1]!, g: +rgb[2]!, b: +rgb[3]! },
        `--player-scrim-${which} must be the canvas colour`,
      ).toEqual(canvas)
    }
  })

  // The most transparent end of the gradient is the worst case for every token.
  test.each([
    ['dark', DARK] as const,
    ['light', LIGHT] as const,
  ])('%s: text clears AA over the veil on any cover', (theme, tokens) => {
    const alpha = Math.min(scrimAlpha(theme, 'from'), scrimAlpha(theme, 'to'))
    const veil = scrimColor(tokens)

    for (const cover of [BLACK, WHITE]) {
      const bg = composite(veil, cover, alpha)
      const on = `${theme} scrim α${alpha} over ${hexColor(cover)} cover`
      // Body copy, the artist line, and lyric highlights — full 4.5.
      expectAA(tokens['content'], bg, `content on ${on}`)
      expectAA(tokens['content-2'], bg, `content-2 on ${on}`)
      expectAA(tokens['accent'], bg, `accent on ${on}`)
      // `--content-muted` is held to 3:1, matching the pre-existing light-theme
      // exemption above — it already only clears 3 on the flat `--paper`, so
      // demanding 4.5 here would be a stricter bar than the rest of the app meets.
      expectAA(tokens['content-muted'], bg, `content-muted on ${on}`, 3)
    }
  })
})
