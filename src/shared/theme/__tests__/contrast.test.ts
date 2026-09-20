import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, test } from 'vitest'

/**
 * Contrast gate for the Apple semantic tokens in `tokens.css`.
 *
 * ── What changed, and why this file is not just a rename ─────────────────────
 *
 * Apple's label tiers are TRANSLUCENT (`rgba(60, 60, 67, 0.6)` and friends). The
 * former Muse tokens were flat hexes, so the old version of this gate could read
 * a colour and compare it directly. That is now wrong: a translucent label's
 * effective colour depends on the surface beneath it, so every text token has to
 * be composited over the specific background being tested before the ratio means
 * anything. Reading `rgba(60, 60, 67, 0.6)` as `#3c3c43` would overstate light
 * secondary text by more than two full ratio points.
 *
 * ── The tiered floor, and the regression it encodes ──────────────────────────
 *
 * Apple's values are shipped verbatim, which is a deliberate and user-approved
 * trade. Measured, not asserted:
 *
 *   light secondaryLabel on white      3.44   (former --content-2: 5.61)
 *   light secondaryLabel on #f2f2f7    3.30
 *   light accent (systemBlue) as text  3.52
 *   light systemRed as text            3.57
 *   light tertiaryLabel on white       1.73
 *   dark  tertiaryLabel on #1c1c1e     2.48
 *
 * Those accent/red figures are the post-June-2025 Apple values (#0088ff / #ff383c);
 * the pre-2025 ones this file was first written against measured 4.02 and 3.55, so
 * the official update cost half a point on both. See `tokens-hig.test.ts` for the
 * provenance of every value.
 *
 * So the floor is tiered rather than uniform:
 *
 *   --label            4.5   body copy must clear AA
 *   --secondary-label  3.0   the accepted regression
 *   --accent (text)    3.0
 *   --system-red       3.0
 *   --tertiary-label   NONE  — no alpha clears even 3.0
 *   --quaternary-label NONE
 *
 * Dropping the numeric floor for the bottom two tiers would be a hole, not a
 * policy, if nothing replaced it. What replaces it is the usage scan at the end
 * of this file: those two tokens may only appear in non-essential roles, which is
 * Apple's own rule for them. That scan carries a self-check, because a scan over
 * zero current call sites passes for the wrong reason.
 *
 * `.increase-contrast` is the mitigation for the 3.0 tier and is gated by value
 * in `tokens-hig.test.ts`; its own ratios are re-derived here.
 *
 * ── What is deliberately preserved from the previous version ─────────────────
 *
 * The glass-stack composition, the player scrim's worst-case-cover derivation and
 * the wash-visibility floor are all kept, because none of them were about the
 * palette — they are about compositing, and they caught real shipped bugs. Their
 * anti-vacuity companions are re-derived rather than copied: one of them (`--paper`
 * over `--canvas` is invisible at 1.04) stopped being TRUE under Apple's
 * backgrounds, which measure 1.116 in light and 1.234 in dark.
 */

const TOKENS_CSS = readFileSync(
  // `pnpm test` always runs from the project root; `import.meta.url`-based
  // `new URL(...)` trips the Lynx vitest env's `self is not defined`.
  resolve(process.cwd(), 'src/shared/theme/tokens.css'),
  'utf8',
)

/** A colour with its own alpha kept, because Apple's labels and fills have one. */
interface Paint {
  r: number
  g: number
  b: number
  /** 1 for an opaque hex; the rgba alpha otherwise. */
  a: number
}

type Rgb = { r: number, g: number, b: number }

function parseHex(hex: string): Paint {
  const c = hex.replace('#', '')
  const full = c.length === 3 ? c.split('').map((ch) => ch + ch).join('') : c
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
    a: 1,
  }
}

function parseRgba(raw: string): Paint {
  const m = raw.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s]+([\d.]+))?\s*\)/)
  if (!m) throw new Error(`not a colour: ${raw}`)
  return {
    r: Number(m[1]),
    g: Number(m[2]),
    b: Number(m[3]),
    a: m[4] === undefined ? 1 : Number(m[4]),
  }
}

/** Source-over composite of `top` onto an opaque `under`. */
function over(top: Paint, under: Rgb): Rgb {
  return {
    r: top.r * top.a + under.r * (1 - top.a),
    g: top.g * top.a + under.g * (1 - top.a),
    b: top.b * top.a + under.b * (1 - top.a),
  }
}

function luminance(c: Rgb): number {
  const to = (v: number): number => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * to(c.r) + 0.7152 * to(c.g) + 0.0722 * to(c.b)
}

function ratio(a: Rgb, b: Rgb): number {
  const la = luminance(a)
  const lb = luminance(b)
  const hi = Math.max(la, lb)
  const lo = Math.min(la, lb)
  return (hi + 0.05) / (lo + 0.05)
}

function hexOf(c: Rgb): string {
  return '#' + [c.r, c.g, c.b]
    .map((v) => Math.round(v).toString(16).padStart(2, '0'))
    .join('')
}

/**
 * How a token reads ON a given background — the composite step the former version
 * of this gate did not need and this one cannot do without.
 */
function contrastOn(token: Paint, bg: Rgb): number {
  return ratio(over(token, bg), bg)
}

/** One `.theme-root.theme-<name>` block, colour declarations only. */
function themeBlock(name: 'dark' | 'light'): string {
  const m = TOKENS_CSS.match(
    new RegExp(`\\.theme-root\\.theme-${name}\\s*\\{([\\s\\S]*?)\\n\\s*\\}`),
  )
  if (!m) throw new Error(`theme block ${name} not found`)
  return m[1]!
}

/**
 * Parse a theme block into `--token → Paint`.
 *
 * `var()` values are skipped on purpose: those are the Muse compatibility
 * aliases, and this gate asserts the Apple tokens that own the semantics. That
 * the aliases point at them, and at nothing else, is `tokens-hig.test.ts`'s job —
 * asserting it in both places would just mean two tests to update in step.
 */
function parseTheme(name: 'dark' | 'light'): Record<string, Paint> {
  const out: Record<string, Paint> = {}
  for (const line of themeBlock(name).split('\n')) {
    const decl = line.match(/^\s*--([\w-]+):\s*(#[0-9a-fA-F]{3,8}|rgba?\([^)]+\))\s*;/)
    if (!decl) continue
    const [, key, val] = decl as unknown as [string, string, string]
    out[key] = val.startsWith('#') ? parseHex(val) : parseRgba(val)
  }
  return out
}

const THEMES = { dark: parseTheme('dark'), light: parseTheme('light') } as const
type ThemeName = keyof typeof THEMES

/** Raw declaration text for one token, straight out of a theme block. */
function rawDecl(theme: ThemeName, token: string): string {
  const decl = themeBlock(theme).match(
    new RegExp(`--${token}:\\s*(#[0-9a-fA-F]{3,8}|rgba?\\([^)]*\\));`),
  )
  expect(decl, `--${token} missing from theme-${theme}`).not.toBeNull()
  return decl![1]!
}

/*
 * Text tokens and their floors. `--tertiary-label` / `--quaternary-label` are
 * absent BY DESIGN — see the header, and the usage scan that stands in for them.
 */
const TEXT_FLOORS: Record<string, number> = {
  'label': 4.5,
  'secondary-label': 3.0,
  'accent': 3.0,
  'system-red': 3.0,
}
const TEXT_TOKENS = Object.keys(TEXT_FLOORS)

/**
 * Token × surface combinations that measurably do NOT clear the floor, and are
 * therefore forbidden rather than exempted.
 *
 * The rule underneath the list: **the two heaviest Apple fills are for shapes, not
 * for coloured text.** In light they darken the page enough to swallow both
 * chromatic tokens — measured on a white page:
 *
 *                          --accent   --system-red
 *   --system-fill (0.20)     2.77         2.81
 *   --secondary-system-fill  2.91         2.95
 *   --tertiary-system-fill   3.05         3.09   ← fine
 *   --quaternary-system-fill 3.20         3.24   ← fine
 *
 * `--label` (16.5–19.1) and `--secondary-label` (3.13–3.31) are unaffected, so the
 * fills are perfectly usable — just not under blue or red text. Dark is unaffected
 * throughout (4.10–5.65): a translucent grey fill over black LIGHTENS the surface,
 * which moves both tokens the helpful way.
 *
 * Nothing ships any of these combinations today — the two heavy fills have no
 * consumers at all — but deleting the surfaces from the sweep to reach green would
 * leave a hole that opens the first time someone backs a search field with
 * `--system-fill` and puts an error message or a link on it.
 *
 * So each entry carries two obligations, both enforced below:
 *  1. it must actually fail, or the entry is stale and must be deleted;
 *  2. no stylesheet may pair them, checked by a scan over every rule.
 */
const FORBIDDEN: Array<{ theme: ThemeName, token: string, surface: string }> = [
  { theme: 'light', token: 'accent', surface: 'system-fill ⊕ page' },
  { theme: 'light', token: 'accent', surface: 'secondary-system-fill ⊕ page' },
  { theme: 'light', token: 'system-red', surface: 'system-fill ⊕ page' },
  { theme: 'light', token: 'system-red', surface: 'secondary-system-fill ⊕ page' },
]

function isForbidden(theme: ThemeName, token: string, surface: string): boolean {
  return FORBIDDEN.some((f) => f.theme === theme && f.token === token && f.surface === surface)
}

function expectReads(fg: Paint, bg: Rgb, label: string, min: number): void {
  const r = contrastOn(fg, bg)
  expect(
    r,
    `${label} = ${r.toFixed(2)} (needs ${min}); composited ${hexOf(over(fg, bg))} on ${hexOf(bg)}`,
  ).toBeGreaterThanOrEqual(min)
}

/**
 * Every surface text actually lands on, as an opaque composite.
 *
 * The fills and the glass fills are translucent, so they are resolved over the
 * page — which is what a fill IS: a tint on whatever is behind it. Resolving them
 * over black instead (the shape a naive parser falls into) would darken a light
 * surface and silently overstate its contrast.
 */
function surfaces(theme: ThemeName): Array<{ name: string, bg: Rgb }> {
  const t = THEMES[theme]
  const page: Rgb = { r: t['system-background']!.r, g: t['system-background']!.g, b: t['system-background']!.b }
  const opaque = (token: string): Rgb => {
    const p = t[token]!
    expect(p, `--${token} declared in theme-${theme}`).toBeDefined()
    expect(p.a, `--${token} is expected to be opaque`).toBe(1)
    return { r: p.r, g: p.g, b: p.b }
  }
  return [
    { name: 'system-background', bg: page },
    { name: 'secondary-system-background', bg: opaque('secondary-system-background') },
    { name: 'tertiary-system-background', bg: opaque('tertiary-system-background') },
    { name: 'system-grouped-background', bg: opaque('system-grouped-background') },
    { name: 'secondary-system-grouped-background', bg: opaque('secondary-system-grouped-background') },
    { name: 'tertiary-system-grouped-background', bg: opaque('tertiary-system-grouped-background') },
    { name: 'system-fill ⊕ page', bg: over(t['system-fill']!, page) },
    { name: 'secondary-system-fill ⊕ page', bg: over(t['secondary-system-fill']!, page) },
    { name: 'tertiary-system-fill ⊕ page', bg: over(t['tertiary-system-fill']!, page) },
    { name: 'quaternary-system-fill ⊕ page', bg: over(t['quaternary-system-fill']!, page) },
    { name: 'material-fill ⊕ page', bg: over(t['material-fill']!, page) },
    { name: 'material-fill-elevated ⊕ page', bg: over(t['material-fill-elevated']!, page) },
  ]
}

describe.each(['dark', 'light'] as const)('%s: text on every surface', (theme) => {
  const t = THEMES[theme]

  test.each(TEXT_TOKENS)('--%s clears its tier on all surfaces', (token) => {
    for (const { name, bg } of surfaces(theme)) {
      if (isForbidden(theme, token, name)) continue
      expectReads(t[token]!, bg, `--${token} on --${name}`, TEXT_FLOORS[token]!)
    }
  })

  test('every forbidden pair really does fail, or it should be deleted', () => {
    // Non-vacuity for FORBIDDEN. An exemption that stopped being necessary would
    // otherwise sit here forever as a silent free pass over a surface that is in
    // fact fine — which is how a skip list rots into a blind spot.
    const mine = FORBIDDEN.filter((f) => f.theme === theme)
    const bySurface = new Map(surfaces(theme).map((s) => [s.name, s.bg]))
    for (const { token, surface } of mine) {
      const bg = bySurface.get(surface)
      expect(bg, `${surface} is a real surface in theme-${theme}`).toBeDefined()
      const r = contrastOn(t[token]!, bg!)
      expect(
        r,
        `--${token} on --${surface} = ${r.toFixed(2)}; it now clears `
          + `${TEXT_FLOORS[token]}, so remove this FORBIDDEN entry`,
      ).toBeLessThan(TEXT_FLOORS[token]!)
    }
  })

  test('the surface list is not silently empty', () => {
    // A typo in the token names above would make `surfaces()` throw, but a future
    // refactor that filtered the list down to nothing would pass every loop.
    expect(surfaces(theme).length).toBeGreaterThanOrEqual(12)
  })

  test('a label on an accent fill reads', () => {
    // White on systemBlue is 4.02 in light and 3.41 in dark — Apple's own values,
    // below AA, which is what .increase-contrast exists for. Filled DESTRUCTIVE
    // controls do not get that latitude: they use the accessible red, where the
    // label clears 4.5 outright.
    const accent = t['accent']!
    expectReads(t['accent-content']!, { r: accent.r, g: accent.g, b: accent.b },
      'accent-content on accent', 3.0)
    const red = t['system-red-strong']!
    expectReads(t['accent-content']!, { r: red.r, g: red.g, b: red.b },
      'accent-content on system-red-strong', 4.5)
  })

  test('systemRed is a text colour, NOT a fill behind a light label', () => {
    // Non-vacuity for the pair above: --system-red-strong exists precisely because
    // --system-red cannot carry white text. If that ever stopped being true the
    // second token would be redundant and should be deleted, not kept.
    const red = t['system-red']!
    const onRed = contrastOn(t['accent-content']!, { r: red.r, g: red.g, b: red.b })
    expect(onRed, `white on --system-red = ${onRed.toFixed(2)}`).toBeLessThan(4.5)
  })
})

/**
 * The glass overlay stack on the background-unknown surfaces (nav capsule,
 * mini-player, sheets, dialogs, popovers).
 *
 * Those surfaces carry two translucent `background-image` layers on top of the
 * `--material-fill*` colour: a vertical luminance ramp and a diagonal sheen. Both lie
 * UNDER text, so neither alpha is a free decorative choice — and the constraint is
 * the STACK, not either layer alone. The sheen originates at the top-left and the
 * ramp peaks along the top edge, so they overlap and text in that corner sees both
 * composited.
 *
 * The alphas were derived against the former palette, where the binding pair was
 * tertiary ink at 4.5 (0.05 + 0.06 landed it at 4.25 and failed; 0.03 + 0.04 gave
 * 4.68). Under the Apple labels the tightest pair on this stack is `--accent`
 * against its 3.0 floor, so the shipped values now carry considerably more margin
 * than they were designed with. They are re-derived here rather than assumed, and
 * kept rather than re-opened — loosening them is a visual decision, not a
 * consequence of the palette swap.
 *
 * The rim layers are deliberately absent: they are 1px `inset` box-shadows, no text
 * ever sits on them, and that is exactly why the rim is where most of the visual
 * work went — brightness there is free.
 */
describe('glass overlay stack (ramp + sheen) over the glass fills', () => {
  for (const theme of ['dark', 'light'] as const) {
    const t = THEMES[theme]
    const page: Rgb = t['system-background']!

    for (const fill of ['material-fill', 'material-fill-elevated'] as const) {
      const base = over(t[fill]!, page)

      test(`${theme}: top-left corner (ramp + sheen) reads on ${fill}`, () => {
        const withRamp = over(parseRgba(rawDecl(theme, 'material-ramp-top')), base)
        const corner = over(parseRgba(rawDecl(theme, 'material-sheen')), withRamp)
        for (const token of TEXT_TOKENS) {
          expectReads(t[token]!, corner, `--${token} on ${fill} + ramp + sheen`, TEXT_FLOORS[token]!)
        }
      })

      test(`${theme}: bottom edge (ramp only, sheen has died) reads on ${fill}`, () => {
        // The sheen stop is transparent past 45%, so the lower half is ramp-only.
        const bottom = over(parseRgba(rawDecl(theme, 'material-ramp-bottom')), base)
        for (const token of TEXT_TOKENS) {
          expectReads(t[token]!, bottom, `--${token} on ${fill} + ramp bottom`, TEXT_FLOORS[token]!)
        }
      })
    }
  }

  test("light's ramp top is fully transparent (pack-safe, and a no-op over white)", () => {
    // `--material-fill` is 0.85 white over a white page, so it composites to pure
    // white and adding white on top is the identity operation. The reason it is
    // ZERO rather than merely small is theme packs, whose background need not be
    // white — there a white stop would stop being a no-op and start lightening a
    // surface carrying dark text.
    expect(rawDecl('light', 'material-ramp-top')).toMatch(/,\s*0\s*\)$/)
  })

  test('the composite layers are wired to the atomic tokens, in one place', () => {
    // Declared once in `.theme-root`; a nested var() inside a custom property does
    // resolve per-theme on the consuming element (headless-Chrome verified through
    // the lynx-css pipeline). Repointing one of these at a hardcoded colour would
    // silently escape every derivation above.
    const root = TOKENS_CSS.match(/\.theme-root \{([\s\S]*?)\n\}/)
    expect(root, '.theme-root block exists').not.toBeNull()
    const body = root![1]!
    expect(body).toMatch(
      /--material-ramp:\s*linear-gradient\([\s\S]*?var\(--material-ramp-top\)[\s\S]*?var\(--material-ramp-bottom\)/,
    )
    expect(body).toMatch(/--material-sheen-layer:\s*linear-gradient\([\s\S]*?var\(--material-sheen\)/)
    expect(body).toMatch(/--material-rim-sides:[\s\S]*?var\(--material-rim-side\)/)
  })

  test('no bare 0 before a negative length inside a custom property', () => {
    // The minifier collapses `inset 0 -1px 0` to `inset 0-1px 0` *inside custom
    // property values* (it leaves direct declarations alone). Chrome re-tokenizes
    // that correctly; a stricter native parser might not, so the bottom hairline
    // stays a direct declaration at each surface.
    const root = TOKENS_CSS.match(/\.theme-root \{([\s\S]*?)\n\}/)![1]!
    const composites = root.match(/--material-(?:rim-sides|ramp|sheen-layer):[\s\S]*?;/g) ?? []
    expect(composites.length, 'the three composite layers are declared').toBe(3)
    for (const decl of composites) {
      expect(decl, `no \`0 -\` sequence in ${decl.slice(0, 40)}`).not.toMatch(/\s0\s+-/)
    }
  })
})

/**
 * The full player's veil over its blurred cover.
 *
 * This is the one surface in the app whose background is not a token: it is the
 * veil composited over whatever colour the current album art happens to be. So the
 * pair that has to clear the floor is text over `veil ⊕ cover`, and the only honest
 * cover to test against is the worst case — pure black and pure white, since album
 * art can be either. Because those are the absolute ends of the range, anything the
 * backdrop does to the cover INSIDE [0, 255] is free, which is what lets
 * `PlayerBackdrop` boost saturation without touching this derivation.
 *
 * RE-DERIVED for the Apple palette; the bounds moved in both themes and the veil
 * colour itself moved in dark (from #0f0f11 to pure black):
 *
 *   light  bound 0.930 (was 0.91), binding pair --system-red over a BLACK cover
 *   dark   bound 0.765 (was 0.83), binding pair --accent over a WHITE cover
 *
 * The shipped alphas (0.94 light, 0.85 dark) both clear their new bound, so they are
 * kept. Light's margin is now thin — 3.10 against a 3.0 floor, where the former
 * derivation had three points — and that is worth knowing before anyone lowers it
 * to show more artwork.
 */
describe('player scrim over worst-case cover art', () => {
  const BACKDROP_CSS = readFileSync(
    resolve(process.cwd(), 'src/features/player/widgets/PlayerBackdrop.css'),
    'utf8',
  )
  const BLACK: Rgb = { r: 0, g: 0, b: 0 }
  const WHITE: Rgb = { r: 255, g: 255, b: 255 }

  /** Alpha of one scrim token, read from `tokens.css`. */
  function scrimAlpha(theme: ThemeName, which: 'from' | 'to'): number {
    const decl = themeBlock(theme).match(
      new RegExp(`--player-scrim-${which}:\\s*rgba?\\([^)]*?([\\d.]+)\\s*\\)`),
    )
    expect(decl, `--player-scrim-${which} missing from theme-${theme}`).not.toBeNull()
    return parseFloat(decl![1]!)
  }

  /** Does every token the player draws clear its floor at this veil alpha? */
  function clearsAt(theme: ThemeName, alpha: number): boolean {
    const t = THEMES[theme]
    const veil = t['system-background']!
    for (const cover of [BLACK, WHITE]) {
      const bg = over({ ...veil, a: alpha }, cover)
      for (const token of TEXT_TOKENS) {
        if (contrastOn(t[token]!, bg) < TEXT_FLOORS[token]!) return false
      }
    }
    return true
  }

  test('the scrim is applied as a gradient of the two tokens', () => {
    // If the stylesheet stops using them, the alphas asserted below stop describing
    // anything that ships.
    const css = BACKDROP_CSS.replace(/\/\*[\s\S]*?\*\//g, '')
    expect(css).toContain('var(--player-scrim-from)')
    expect(css).toContain('var(--player-scrim-to)')
  })

  test.each(['dark', 'light'] as const)('%s: the veil is the page colour', (theme) => {
    // Any other hue would need its own foreground palette; using the page colour is
    // what lets the player keep the ordinary label tokens.
    const page = THEMES[theme]['system-background']!
    for (const which of ['from', 'to'] as const) {
      const rgb = themeBlock(theme).match(
        new RegExp(`--player-scrim-${which}:\\s*rgba?\\(\\s*(\\d+)[,\\s]+(\\d+)[,\\s]+(\\d+)`),
      )!
      expect(
        { r: +rgb[1]!, g: +rgb[2]!, b: +rgb[3]! },
        `--player-scrim-${which} must be the --system-background colour`,
      ).toEqual({ r: page.r, g: page.g, b: page.b })
    }
  })

  test.each(['dark', 'light'] as const)('%s: text clears its tier over any cover', (theme) => {
    // The most transparent end of the gradient is the worst case for every token.
    const alpha = Math.min(scrimAlpha(theme, 'from'), scrimAlpha(theme, 'to'))
    const t = THEMES[theme]
    const veil = t['system-background']!
    for (const cover of [BLACK, WHITE]) {
      const bg = over({ ...veil, a: alpha }, cover)
      const on = `${theme} scrim a${alpha} over ${hexOf(cover)} cover`
      for (const token of TEXT_TOKENS) {
        expectReads(t[token]!, bg, `--${token} on ${on}`, TEXT_FLOORS[token]!)
      }
    }
  })

  test.each(['dark', 'light'] as const)('%s: the shipped alpha is derived, not chosen', (theme) => {
    /*
     * Find the bound instead of restating it: step up until every pair clears, then
     * assert the shipped value is at or above that, AND that one step below the
     * bound genuinely fails. The second half is what stops this from degrading into
     * "0.94 >= 0.0" — if the palette ever got so forgiving that any alpha worked,
     * this test would say so rather than quietly passing.
     */
    let bound: number | null = null
    for (let a = 0; a <= 1.0001; a += 0.005) {
      if (clearsAt(theme, a)) { bound = Math.round(a * 1000) / 1000; break }
    }
    expect(bound, `no veil alpha clears the floors in ${theme}`).not.toBeNull()

    const shipped = Math.min(scrimAlpha(theme, 'from'), scrimAlpha(theme, 'to'))
    expect(
      shipped,
      `${theme} veil alpha ${shipped} is below its derived bound ${bound}`,
    ).toBeGreaterThanOrEqual(bound!)

    expect(
      bound! > 0 && !clearsAt(theme, bound! - 0.01),
      `${theme}'s bound ${bound} must be a real bound — one step below it has to fail, `
        + 'or the veil is unconstrained and this whole derivation is decoration',
    ).toBe(true)
  })
})

/** Every stylesheet under `src/`, comments stripped, as `[path, css]`. */
function stylesheets(): Array<[string, string]> {
  const out: Array<[string, string]> = []
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        if (entry.name !== '__tests__') walk(full)
      } else if (entry.name.endsWith('.css')) {
        out.push([
          full.split('/src/')[1]!,
          readFileSync(full, 'utf8').replace(/\/\*[\s\S]*?\*\//g, ''),
        ])
      }
    }
  }
  walk(resolve(process.cwd(), 'src'))
  return out
}

/** `selector { body }` pairs from one stylesheet. */
function rulesOf(css: string): Array<{ selector: string, body: string }> {
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
    selector: (m[1] ?? '').trim(),
    body: m[2] ?? '',
  }))
}

/**
 * The `color:` value of a rule, or ''. The lookbehind is load-bearing: without it
 * `background-color:` answers first and every offender reads as clean. (That exact
 * mistake is why the previous version of this file carried a self-check for it, and
 * it is kept below.)
 */
function textColour(body: string): string {
  return /(?<![-\w])color:\s*([^;]+);/.exec(body)?.[1] ?? ''
}

function backgroundColour(body: string): string {
  return /background(?:-color)?:\s*([^;]+);/.exec(body)?.[1] ?? ''
}

/**
 * A state wash has to be visible against what it sits on.
 *
 * This is the one relationship WCAG says nothing about, and the gap is where a real
 * bug lived: two multi-select highlights painted `--paper` over `--canvas` — 250 vs
 * 255, a ratio of 1.04 — so selecting a row changed nothing on screen. Nobody
 * noticed because every TEXT pair still passed; the wash was invisible, not
 * illegible.
 *
 * The floor is 1.08. It is a separation, not a standard.
 *
 * The former anti-vacuity companion asserted that `--paper` over `--canvas` still
 * measures below the floor, so the floor demonstrably rejected the shipped bug.
 * That assertion is GONE because it stopped being true: Apple's secondary
 * background over the primary one measures 1.116 in light and 1.234 in dark, i.e.
 * the original defect is no longer reproducible with these values. Deleting it
 * without replacement would have left the number unjustified, so the replacement
 * derives each wash's minimum alpha and requires one step below it to fail.
 */
describe('state washes over the surfaces they sit on', () => {
  const FLOOR = 1.08
  /** `--tint-fill` (accent, pack-tintable) and the neutral on-material fill. */
  const WASHES = ['tint-fill', 'quaternary-system-fill'] as const

  function backdrops(theme: ThemeName): Array<{ name: string, bg: Rgb }> {
    const t = THEMES[theme]
    const page: Rgb = t['system-background']!
    return [
      { name: 'the page', bg: page },
      { name: 'glass', bg: over(t['material-fill-elevated']!, page) },
    ]
  }

  for (const theme of ['dark', 'light'] as const) {
    const t = THEMES[theme]

    test.each(WASHES)(`${theme}: --%s is visible over the page and over glass`, (wash) => {
      for (const { name, bg } of backdrops(theme)) {
        const washed = over(t[wash]!, bg)
        const r = ratio(washed, bg)
        expect(
          r,
          `--${wash} over ${name} = ${r.toFixed(3)} (${hexOf(washed)} on ${hexOf(bg)}). `
            + `Below ${FLOOR} the state is not visible — which is how a selection `
            + 'highlight painted an adjacent surface colour shipped: every text pair '
            + 'passed, the highlight did not exist.',
        ).toBeGreaterThanOrEqual(FLOOR)
      }
    })

    test.each(WASHES)(`${theme}: --%s's alpha is derived, not chosen`, (wash) => {
      const paint = t[wash]!
      for (const { name, bg } of backdrops(theme)) {
        let bound: number | null = null
        for (let a = 0; a <= 1.0001; a += 0.005) {
          if (ratio(over({ ...paint, a }, bg), bg) >= FLOOR) {
            bound = Math.round(a * 1000) / 1000
            break
          }
        }
        expect(bound, `no alpha makes --${wash} visible over ${name}`).not.toBeNull()
        expect(
          paint.a,
          `--${wash} alpha ${paint.a} is below its derived bound ${bound} over ${name}`,
        ).toBeGreaterThanOrEqual(bound!)
        // …and the bound must bite, or FLOOR is decoration.
        expect(
          ratio(over({ ...paint, a: Math.max(0, bound! - 0.01) }, bg), bg),
          `one step below the bound must fail over ${name}, or --${wash} is unconstrained`,
        ).toBeLessThan(FLOOR)
      }
    })

    test.each(WASHES)(`${theme}: text still reads on a row washed with --%s`, (wash) => {
      for (const { name, bg } of backdrops(theme)) {
        const washed = over(t[wash]!, bg)
        for (const token of TEXT_TOKENS) {
          expectReads(t[token]!, washed, `--${token} on --${wash} over ${name}`, TEXT_FLOORS[token]!)
        }
      }
    })
  }

  test('the SongRow selected step-up lifts secondary-label to label', () => {
    /*
     * The subtitle/duration baseline is `--label` at 65% opacity (~4.5:1 AA on both
     * themes). `--secondary-label` does not hit 4.5:1 against a white page (3.3:1)
     * and `--font-footnote` at 13px needs AA per WCAG, so the baseline itself uses
     * the primary label at reduced opacity. Selected rows step to full-opacity
     * `--label`.
     */
    const css = readFileSync(
      resolve(process.cwd(), 'src/features/library/widgets/SongRow.css'),
      'utf8',
    ).replace(/\/\*[\s\S]*?\*\//g, '')
    const rule = (sel: string): string =>
      rulesOf(css).find((r) => r.selector === sel)?.body ?? ''
    expect(
      textColour(rule('.song-row__subtitle')),
      'the subtitle baseline is --label at reduced opacity (AA at 13px)',
    ).toBe('var(--label)')
    expect(
      textColour(rule('.song-row__duration')),
      'the duration baseline is --label at reduced opacity',
    ).toBe('var(--label)')
    // The selected step-up is a single rule covering both; it must step to label.
    const stepped = rulesOf(css).find((r) =>
      r.selector.includes('.song-row--selected') && r.selector.includes('__subtitle'),
    )
    expect(
      stepped,
      'the selected-row step-up rule is missing',
    ).toBeDefined()
    expect(
      textColour(stepped!.body),
      'a selected row steps its metadata to --label (full opacity)',
    ).toBe('var(--label)')
  })
})

/**
 * Gate B — the usage rule that stands in for the missing numeric floor.
 *
 * `--tertiary-label` and `--quaternary-label` cannot clear even 3.0 on any surface
 * (1.37–2.48, asserted below so this is not taken on faith). Apple ships them
 * anyway because they are not for information: they are for placeholders, disabled
 * controls and decoration. That is a usage constraint, so it is gated as one.
 *
 * A scan is only worth what its self-check proves. Nothing in the tree uses either
 * token today, so the scan passes trivially — and would keep passing if the
 * detector were broken. The two tests after it feed the detector known-bad and
 * known-good input.
 */
describe('gate B: the bottom label tiers stay out of load-bearing text', () => {
  const UNREADABLE = ['tertiary-label', 'quaternary-label'] as const

  /** Selectors whose role is inherently non-essential, per Apple's own usage rule. */
  const NON_ESSENTIAL = /--(?:disabled|placeholder|empty|decorative)\b|__placeholder\b/

  /** Violations in one stylesheet: unreadable ink used as ordinary text. */
  function violationsIn(file: string, css: string): string[] {
    return rulesOf(css).flatMap(({ selector, body }) => {
      const colour = textColour(body)
      const token = UNREADABLE.find((u) => colour.includes(`--${u}`))
      if (token == null) return []
      if (NON_ESSENTIAL.test(selector)) return []
      return [`${file}: ${selector} uses --${token} as text`]
    })
  }

  test('these tiers really are unreadable, or this whole gate is theatre', () => {
    for (const theme of ['dark', 'light'] as const) {
      const t = THEMES[theme]
      for (const token of UNREADABLE) {
        for (const { name, bg } of surfaces(theme)) {
          const r = contrastOn(t[token]!, bg)
          expect(
            r,
            `--${token} on --${name} (${theme}) = ${r.toFixed(2)}; if it now clears 3.0 `
              + 'it should get a numeric floor in TEXT_FLOORS instead of a usage rule',
          ).toBeLessThan(3.0)
        }
      }
    }
  })

  test('no stylesheet uses an unreadable tier for load-bearing text', () => {
    const sheets = stylesheets()
    expect(sheets.length, 'no stylesheets scanned — the walk is broken').toBeGreaterThan(30)
    const violations = sheets.flatMap(([file, css]) => violationsIn(file, css))
    expect(
      violations.sort(),
      'tertiary/quaternary label is below 3.0 on every surface. Use --secondary-label '
        + 'for anything a user has to read; these two are for placeholders, disabled '
        + 'controls and decoration.',
    ).toEqual([])
  })

  test('the detector catches the shape it is written for', () => {
    // Known-bad: ordinary text at the tertiary tier.
    expect(violationsIn('x.css', '.song-row__subtitle { color: var(--tertiary-label); }'))
      .toHaveLength(1)
    // Known-bad even when a background is declared first — the lookbehind case that
    // silently defeated an earlier version of this scan.
    expect(violationsIn('x.css', [
      '.chip {',
      '  background-color: var(--tint-fill);',
      '  color: var(--quaternary-label);',
      '}',
    ].join('\n'))).toHaveLength(1)
    // Known-good: a genuinely non-essential role.
    expect(violationsIn('x.css', '.field--placeholder { color: var(--tertiary-label); }'))
      .toEqual([])
    expect(violationsIn('x.css', '.btn--disabled { color: var(--quaternary-label); }'))
      .toEqual([])
    // Known-good: the secondary tier is always allowed.
    expect(violationsIn('x.css', '.song-row__subtitle { color: var(--secondary-label); }'))
      .toEqual([])
  })

  test('the lookbehind in the colour probe is doing its job', () => {
    // Pinned separately from the scan, because if this regex regresses every test
    // above still passes while the scan silently answers about backgrounds.
    const body = '  background-color: var(--tint-fill);\n  color: var(--tertiary-label);\n'
    expect(textColour(body)).toBe('var(--tertiary-label)')
    expect(/\bcolor:\s*([^;]+);/.exec(body)?.[1]).toBe('var(--tint-fill)')
  })
})

/**
 * The FORBIDDEN pairs from gate A, enforced against the stylesheets.
 *
 * A measured failure that is merely skipped in the numeric sweep is a hole. These
 * combinations do not ship today (both heavy fills have no consumers at all), so
 * this scan exists for the day one of them gains one.
 */
test('no stylesheet puts chromatic text on one of the two heavy Apple fills', () => {
  // P10 deleted the --primary/--danger aliases and swept every consumer, so only
  // the real Apple chromatic names can appear. (During the staged migration both
  // the Apple names and the aliases were checked; the aliases are gone now.)
  const CHROMATIC = ['--accent', '--system-red']
  const HEAVY_FILL = ['--system-fill', '--secondary-system-fill']

  const offenders = stylesheets().flatMap(([file, css]) =>
    rulesOf(css).flatMap(({ selector, body }) => {
      const colour = textColour(body)
      const background = backgroundColour(body)
      const chromatic = CHROMATIC.some((c) => colour.includes(c))
      const heavy = HEAVY_FILL.some((f) => background.includes(f))
      return chromatic && heavy ? [`${file}: ${selector}`] : []
    }),
  )
  expect(
    offenders.sort(),
    'in light, --accent measures 2.77 / 2.91 and --system-red 2.81 / 2.95 on '
      + '--system-fill / --secondary-system-fill. Those two fills are for shapes, not '
      + 'for coloured text: use --tertiary-system-fill or --quaternary-system-fill '
      + 'under blue or red text, or keep the heavy fill and use --label on it (16.5+).',
  ).toEqual([])
})
