import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
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
    } else if (
      key === 'paper-clear' || key.startsWith('glass-fill')
      || key === 'fill-faint' || key === 'primary-faint'
    ) {
      // blended over canvas at parse time. glass-fill/glass-fill-strong are
      // translucent paper colours floating over the page (not solid scrims),
      // so their effective background is fill ⊕ canvas — the same composite
      // paper-clear uses. Blending them over black (the else branch) would
      // darken a light glass surface and mis-state its contrast.
      //
      // The two `*-faint` washes are the same shape one layer further in: they
      // are what a selected/active row paints ON a surface, so text on such a row
      // sees wash ⊕ surface. Over the page that surface is the canvas (below);
      // over glass it is the glass composite, checked in its own describe.
      if (out['canvas'] == null) {
        throw new Error(
          `--${key} is declared before --canvas in tokens.css, so it cannot be `
            + 'composited. Move it after --canvas rather than deleting this check: '
            + 'blending it over black instead would silently understate contrast.',
        )
      }
      out[key] = parseRgbaOver(val, out['canvas'])
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
  // `fill-faint` is the neutral on-material fill (inset info blocks, progress
  // tracks, the plugin dialogs' error/stats boxes) — text sits on it, so it is a
  // surface for this gate's purposes even though it is not a surface token.
  const surfaces = [
    'canvas', 'paper', 'paper-clear', 'neutral-faint', 'fill-faint',
    'glass-fill', 'glass-fill-strong',
  ] as const

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
  test('content/content-2 read on fill-faint ≥4.5', () => {
    expectAA(LIGHT['content'], LIGHT['fill-faint'], 'content on fill-faint')
    expectAA(LIGHT['content-2'], LIGHT['fill-faint'], 'content-2 on fill-faint')
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
 * The glass overlay stack on the background-unknown surfaces (nav capsule,
 * mini-player, sheets, dialogs, popovers).
 *
 * Those surfaces gained two translucent `background-image` layers on top of the
 * `--glass-fill*` colour: a vertical luminance ramp and a diagonal sheen. Both
 * lie **under text**, so neither alpha is a free decorative choice — and the
 * constraint is the *stack*, not either layer alone. The sheen originates at the
 * top-left and the ramp peaks along the top edge, so they overlap, and text in
 * that corner sees both composited. Checked separately, dark ramp 0.05 + sheen
 * 0.06 each pass; composited they put `--content-muted` at 4.25 and fail. The
 * shipped pair (0.03 / 0.04) lands it at 4.68.
 *
 * The rim layers are deliberately absent from this gate: they are 1px `inset`
 * box-shadows, no text ever sits on them, and that is exactly why the rim is
 * where most of the visual work went — brightness there is free.
 *
 * Light's ramp top is `rgba(255, 255, 255, 0)` on purpose, asserted below. Its
 * fill composites to pure white, so a white top stop is the identity operation
 * anyway; the reason it is *zero* rather than merely small is theme packs, whose
 * `backgroundColor` need not be white — there a white stop would stop being a
 * no-op and start lightening a surface carrying dark text.
 *
 * Thresholds mirror the per-theme blocks above: dark holds every text token at
 * 4.5, light holds `--content-muted`/`--danger` at 3 (the documented
 * large-text-only gap) and the rest at 4.5.
 */
/** Light's muted/danger gaps are documented in the light-theme block above. */
function floorFor(theme: 'dark' | 'light', token: string): number {
  return theme === 'light' && (token === 'content-muted' || token === 'danger') ? 3 : 4.5
}

/** Raw declaration text for one rgba token, straight out of a theme block. */
function rawDecl(theme: 'dark' | 'light', token: string): string {
  const block = TOKENS_CSS.match(
    new RegExp(`\\.theme-root\\.theme-${theme}\\s*\\{([\\s\\S]*?)\\n\\s*\\}`),
  )
  const decl = block![1]!.match(new RegExp(`--${token}:\\s*(rgba?\\([^)]*\\));`))
  expect(decl, `--${token} missing from theme-${theme}`).not.toBeNull()
  return decl![1]!
}

describe('glass overlay stack (ramp + sheen) over the glass fills', () => {
  const TEXT_TOKENS = ['content', 'content-2', 'content-muted', 'accent', 'danger'] as const

  for (const [theme, tokens] of [
    ['dark', DARK],
    ['light', LIGHT],
  ] as const) {
    for (const fill of ['glass-fill', 'glass-fill-strong'] as const) {
      // DARK/LIGHT already hold the fill composited over the canvas.
      const base = tokens[fill]!

      test(`${theme}: top-left corner (ramp ⊕ sheen) reads on ${fill}`, () => {
        const withRamp = parseRgbaOver(rawDecl(theme, 'glass-ramp-top'), base)
        const corner = parseRgbaOver(rawDecl(theme, 'glass-sheen'), withRamp)
        for (const token of TEXT_TOKENS) {
          expectAA(tokens[token]!, corner, `${token} on ${fill} + ramp + sheen`, floorFor(theme, token))
        }
      })

      test(`${theme}: bottom edge (ramp only, sheen has died) reads on ${fill}`, () => {
        // The sheen stop is transparent past 45%, so the lower half is ramp-only.
        const bottom = parseRgbaOver(rawDecl(theme, 'glass-ramp-bottom'), base)
        for (const token of TEXT_TOKENS) {
          expectAA(tokens[token]!, bottom, `${token} on ${fill} + ramp bottom`, floorFor(theme, token))
        }
      })
    }
  }

  test("light's ramp top is fully transparent (pack-safe, and a no-op over white)", () => {
    expect(rawDecl('light', 'glass-ramp-top')).toMatch(/,\s*0\s*\)$/)
  })

  test('the composite layers are wired to the atomic tokens, in one place', () => {
    // Declared once in `.theme-root`; a nested var() inside a custom property
    // does resolve per-theme on the consuming element (headless-Chrome verified
    // through the lynx-css pipeline). Repointing one of these at a hardcoded
    // colour would silently escape every derivation above.
    const root = TOKENS_CSS.match(/\.theme-root \{([\s\S]*?)\n\}/)
    expect(root, '.theme-root block exists').not.toBeNull()
    const body = root![1]!
    expect(body).toMatch(/--glass-ramp:\s*linear-gradient\([\s\S]*?var\(--glass-ramp-top\)[\s\S]*?var\(--glass-ramp-bottom\)/)
    expect(body).toMatch(/--glass-sheen-layer:\s*linear-gradient\([\s\S]*?var\(--glass-sheen\)/)
    expect(body).toMatch(/--glass-rim-sides:[\s\S]*?var\(--glass-rim-side\)/)
  })

  test('no bare 0 before a negative length inside a custom property', () => {
    // The minifier collapses `inset 0 -1px 0` to `inset 0-1px 0` *inside custom
    // property values* (it leaves direct declarations alone). Chrome
    // re-tokenizes that correctly; a stricter native parser might not, so the
    // bottom hairline stays a direct declaration at each surface.
    const root = TOKENS_CSS.match(/\.theme-root \{([\s\S]*?)\n\}/)![1]!
    const composites = root.match(/--glass-(?:rim-sides|ramp|sheen-layer):[\s\S]*?;/g) ?? []
    expect(composites.length, 'the three composite layers are declared').toBe(3)
    for (const decl of composites) {
      expect(decl, `no \`0 -\` sequence in ${decl.slice(0, 40)}`).not.toMatch(/\s0\s+-/)
    }
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
 * Because the extremes are the absolute ends of the range, anything the backdrop does
 * to the cover *inside* [0, 255] is free here — that is what lets `PlayerBackdrop`
 * boost saturation without touching this derivation.
 *
 * The bound is tight in light and it decided the design rather than confirming it:
 * light `--content-2` reached only 4.23:1 at α=0.90 and 4.43:1 at α=0.92 when this was
 * derived, so the first workable value was 0.93. (Deepening `--content-2` to #67676f
 * for the selection wash later moved that bound to 0.91; the shipped 0.94 did not
 * change, so it now carries more margin than it was designed with.) Dark is a different problem — there the bright extreme is the
 * dangerous one, and it is far cheaper to survive: `--content-2` clears at 0.83. The
 * two themes therefore ship different alphas (0.94 light, 0.85 dark) and this test
 * derives each from the shipped value rather than assuming they agree. They were
 * briefly equal, which quietly cost dark ~11 alpha points of artwork.
 *
 * Loosening either past its own bound turns this red — which is the intended outcome,
 * not an obstacle.
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

/**
 * A state wash has to be visible against what it sits on.
 *
 * This is the one relationship in the token set that WCAG says nothing about, and
 * the gap is where a real bug lived: two multi-select highlights painted `--paper`
 * over `--canvas` — 250 vs 255 in light, a ratio of 1.04 — so selecting a row
 * changed nothing on screen. Nobody noticed because every *text* pair still
 * passed; the wash was invisible, not illegible.
 *
 * The floor is 1.08. It is not a standard, it is a separation: the shipped washes
 * land at 1.11–1.41, and the shape that shipped the bug sits at 1.04 (light) and
 * 1.07 (dark). Asserting both ends means neither a weaker wash nor a re-run of the
 * `--paper` mistake can pass, and the number is not pinned to today's alphas.
 *
 * Washes are checked over BOTH backdrops they actually get painted on: the page
 * (`--canvas`) and glass (`--glass-fill-strong`, itself already composited over
 * the canvas). A wash inside a sheet is the common case — the play-queue drawer,
 * the popover's selected item.
 */
describe('state washes over the surfaces they sit on', () => {
  const FLOOR = 1.08

  /** `--primary-faint` (accent, pack-tintable) and `--fill-faint` (neutral). */
  const WASHES = ['primary-faint', 'fill-faint'] as const

  /*
   * Text that actually sits on a washed row: titles (`--content`), the current
   * row's title (`--accent`), destructive menu items (`--danger`), and metadata,
   * which is `--content-2` *because* of the wash — `--content-muted` on a wash
   * measures 3.86 in dark, so the three washed rows step their metadata up a
   * level. Those step-ups are pinned below; without them this list would be
   * understating what ships.
   */
  const WASH_TEXT = ['content', 'content-2', 'accent', 'danger'] as const

  for (const [theme, tokens] of [
    ['dark', DARK],
    ['light', LIGHT],
  ] as const) {
    for (const wash of WASHES) {
      test(`${theme}: --${wash} is visible over the page and over glass`, () => {
        for (const under of ['canvas', 'glass-fill-strong'] as const) {
          const bg = parseRgbaOver(rawDecl(theme, wash), tokens[under]!)
          const r = ratio(bg, tokens[under]!)
          expect(
            r,
            `--${wash} over --${under} = ${r.toFixed(3)} (${hexColor(bg)} on `
              + `${hexColor(tokens[under]!)}). Below ${FLOOR} the state is not `
              + 'visible — which is how a selection highlight painted --paper over '
              + '--canvas shipped: every text pair passed, the highlight did not exist.',
          ).toBeGreaterThanOrEqual(FLOOR)
        }
      })

      test(`${theme}: text still reads on a row washed with --${wash}`, () => {
        for (const under of ['canvas', 'glass-fill-strong'] as const) {
          const bg = parseRgbaOver(rawDecl(theme, wash), tokens[under]!)
          for (const token of WASH_TEXT) {
            expectAA(
              tokens[token]!,
              bg,
              `${token} on --${wash} ⊕ --${under}`,
              floorFor(theme, token),
            )
          }
        }
      })
    }

    test(`${theme}: an opaque surface token would fail the visibility floor`, () => {
      // The defect shape, kept red on purpose. If tokens.css ever drifts far
      // enough that --paper clears the floor over --canvas, this floor has stopped
      // rejecting the bug it was written for and the number needs re-deriving.
      const r = ratio(tokens['paper']!, tokens['canvas']!)
      expect(
        r,
        `--paper over --canvas = ${r.toFixed(3)}; the floor ${FLOOR} exists to `
          + 'reject exactly this as a row wash',
      ).toBeLessThan(FLOOR)
    })
  }

  test('the washed rows step their metadata up from --content-muted', () => {
    // WASH_TEXT above omits `--content-muted` because no washed row uses it any
    // more. That is a fact about two stylesheets, so read them: if a step-up is
    // deleted, tertiary text is back on a wash at 3.86 and the omission is a lie.
    // Both washed row types are covered — the play-queue drawer's own row, and the
    // shared `.song-row` that the two multi-select pages wrap in a wash.
    const STEP_UPS: Array<[string, RegExp]> = [
      [
        'features/player/widgets/SheetShell.css',
        /\.drawer__row--active \.drawer__row-artist \{\s*color: var\(--content-2\)/,
      ],
      [
        'features/library/widgets/SongRow.css',
        /\.song-row--selected \.song-row__subtitle,\s*\.song-row--selected \.song-row__duration \{\s*color: var\(--content-2\)/,
      ],
    ]
    for (const [file, re] of STEP_UPS) {
      const css = readFileSync(resolve(process.cwd(), 'src', file), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
      expect(css, `${file} must step washed-row metadata up to --content-2`).toMatch(re)
    }
  })

  test('no stylesheet puts --content-muted text on a wash background', () => {
    /*
     * The two tests above cover the rows this batch touched. They do not cover a
     * rule nobody thought of — and two shipped: `.media-list-item__badge` and
     * `.playlist-card__chip` painted `--primary-faint` under `--content-muted` at
     * `--font-2xs`, i.e. 4.14 over the page and 3.74 over glass in dark, the exact
     * pair WASH_TEXT omits. Naming the known rows is a whitelist; this is the net.
     *
     * Shape, not token list: any rule whose background is a wash and whose own
     * `color` is `--content-muted`. Matching `color:` needs the lookbehind, or
     * `background-color:` answers first and every offender reads as clean.
     */
    const sheets: string[] = []
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name)
        if (entry.isDirectory()) {
          if (entry.name !== '__tests__') walk(full)
        } else if (entry.name.endsWith('.css')) sheets.push(full)
      }
    }
    walk(resolve(process.cwd(), 'src'))

    const offenders = sheets.flatMap((file) => {
      const css = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
      return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].flatMap((rule) => {
        const [, selector = '', body = ''] = rule
        const background = /background(?:-color)?:\s*([^;]+);/.exec(body)?.[1] ?? ''
        const colour = /(?<![-\w])color:\s*([^;]+);/.exec(body)?.[1] ?? ''
        const washed = WASHES.some((w) => background.includes(`--${w}`))
        return washed && colour.includes('--content-muted')
          ? [`${file.split('/src/')[1]}: ${selector.trim()}`]
          : []
      })
    })

    expect(sheets.length, 'no stylesheets scanned — the walk is broken').toBeGreaterThan(30)
    expect(
      offenders,
      'tertiary ink on a wash is below AA in dark — step it up to --content-2',
    ).toEqual([])
  })

  test('the wash/--content-muted detector matches the shape it is written for', () => {
    // Defect-shape check, including the lookbehind: without it `background-color`
    // satisfies the `color:` probe and the scan above silently passes everything.
    const body = '  background-color: var(--primary-faint);\n  color: var(--content-muted);\n'
    expect(/(?<![-\w])color:\s*([^;]+);/.exec(body)?.[1]).toBe('var(--content-muted)')
    expect(/\bcolor:\s*([^;]+);/.exec(body)?.[1]).toBe('var(--primary-faint)')
  })

  test('--content-muted on a wash is the pair the step-ups exist for', () => {
    // Non-vacuity for the test above: it is only worth anything while the shade it
    // avoids would actually fail. Dark, over glass, is the worst case.
    const bg = parseRgbaOver(rawDecl('dark', 'primary-faint'), DARK['glass-fill-strong']!)
    const r = ratio(DARK['content-muted']!, bg)
    expect(r, `content-muted on the dark wash = ${r.toFixed(2)}`).toBeLessThan(4.5)
  })
})
