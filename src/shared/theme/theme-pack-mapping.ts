import { getFontScaleNumber } from './font-scale-model.js'
import { getMaterialVariant } from './material-model.js'
import { MATERIAL_TOKENS } from './material-tokens.js'

/**
 * Theme-pack → Apple-semantic token mapping (pure functions).
 *
 * The backend's theme-pack schema (`models.ThemePackData` in the Go service) is
 * Material-flavoured: `seedColor` feeds Flutter's `ColorScheme.fromSeed`, which
 * sprays a whole tonal palette. This client deliberately does NOT port
 * fromSeed — it has a single accent channel. Instead we make a minimal honest
 * mapping onto the Apple semantic tokens:
 *
 * | pack field                | token(s)                            |
 * |---------------------------|-------------------------------------|
 * | light/dark.seedColor      | --accent                            |
 * | (derived from seedColor)  | --accent-content (YIQ black/white)  |
 * | (derived from seedColor)  | --tint-fill (10%/18% alpha wash)    |
 * | light/dark.backgroundColor| --system-background                 |
 * |                           | --system-grouped-background         |
 * | light/dark.surfaceColor   | --secondary-system-background       |
 * |                           | --secondary-system-grouped-background |
 * | light/dark.glassColor     | --glass-glow (solid)                |
 * | (derived from glassColor) | --glass-glow-faint (0.10/0.14)      |
 * | (derived from glassColor) | --glass-sheen (0.10/0.04)           |
 * | (baseline, not pack-driven)| --glass-fill/fill-strong/border/    |
 * |                           |   highlight                         |
 * | cardRadius                | --radius-lg                         |
 * | controlRadius             | --radius-md                         |
 * | navigationRadius          | --radius-nav (legacy: the nav bar   |
 * |                           | is a fixed capsule now; the token   |
 * |                           | is kept for schema compat but has   |
 * |                           | no consumer)                        |
 *
 * The pack's two surface colours drive BOTH background groups (plain and
 * grouped). Apple keeps those groups distinct — in light a plain page is white
 * with grey cards while a grouped page is grey with white cards — but a pack
 * only supplies one page colour and one card colour, so the honest mapping is
 * to send the same pair to both groups. Mapping only the plain group would
 * leave every settings-style page sitting on the untouched Apple grey while the
 * rest of the app wore the pack, which reads as a bug rather than a theme. This
 * is not a widening of what a pack can reach: the same two colours already
 * reached these surfaces under the former `--canvas`/`--paper` pair.
 *
 * The label / fill / separator tiers and `--player-scrim-*` stay at their
 * baseline: the pack schema has no field for them, and the baseline is the
 * implicit contrast floor (`contrast.test.ts` gates it). The scrim alphas in
 * `tokens.css` are *computed* against the baseline page colour — repainting
 * them with a pack colour would break that derivation, so they are never
 * overridden.
 *
 * Because the former Muse names survive in `tokens.css` only as thin aliases
 * (`--primary: var(--accent)`), a pack MUST set the Apple name: the aliases are
 * class declarations and the pack's inline properties win over them, so an
 * alias resolves through to the pack's value and un-migrated CSS keeps getting
 * pack colours. Setting the alias instead would strand the override the moment
 * a screen migrated onto the real token.
 *
 * `playerGradient` is ignored on purpose: the Lynx player renders a scrim veil
 * over the blurred cover, not a gradient (see `tokens.css` for why), and
 * `player-backdrop-css.test.ts` holds that line.
 *
 * Delivery mechanism: inline CSS custom properties on the theme root. Lynx
 * supports declaring CSS variables in the style attribute
 * (https://lynxjs.org/api/css/properties/css-variable); inline beats the
 * `.theme-root.theme-<x>` class declarations, so "pack overrides baseline" is
 * exactly the cascade — no `!important` anywhere.
 *
 * **The key set is constant, and every key always gets a value.** Probing the
 * ReactLynx runtime showed that updating a style object from
 * `{--primary: …}` to `{}` or `undefined` leaves the old declaration in place —
 * style-object diffs merge, they never remove. So a "clear the pack" that
 * dropped the attribute would leave the UI wearing the old colours forever
 * (and pack→pack switches would leak the previous pack's keys). Instead the
 * mapping always emits every overridable token: pack values where the pack
 * supplies a valid one, the Muse baseline elsewhere. With no pack that is the
 * full baseline — inline and class declarations agree, so the look is
 * identical, and correctness never depends on attribute removal.
 */

/** Colors for one brightness variant of a pack. Backend validates `#RRGGBB`. */
export interface ThemePackColors {
  seedColor?: string
  backgroundColor?: string
  surfaceColor?: string
  /**
   * Independent colour for the Liquid Glass decorative tint. Drives
   * `--glass-glow` / `--glass-glow-faint` / `--glass-sheen` — SEPARATE from
   * `seedColor` (which drives the button/accent channel), so a pack can tint
   * its glass without recolouring its buttons (true dual-channel). Optional:
   * absent → the client's star-blue glass baseline applies (glass stays a
   * different colour from buttons even with no pack).
   */
  glassColor?: string
}

/** The `data` payload of a theme pack (schema v1, see the backend's ThemePackData). */
export interface ThemePackData {
  id: string
  name: string
  author: string
  description: string
  version: string
  schemaVersion: number
  dark?: ThemePackColors
  light?: ThemePackColors
  cardRadius?: number
  controlRadius?: number
  navigationRadius?: number
  /** Navigation bar style: 'standard' | 'capsule'. Lynx only implements
   *  capsule — the field is read for schema compat but has no consumer. */
  navigationStyle?: string
  playerGradient?: string[]
}

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/

/** True when `value` is a `#RRGGBB` color — the only format the backend accepts. */
export function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && HEX_COLOR.test(value)
}

/**
 * Black or white — whichever reads on `hex`. YIQ perceived-luma heuristic: the
 * pack schema has no "on-accent" field, so the accent-contrast token must be
 * derived or accent fills would get unreadable labels (the exact class of bug
 * `tokens-defined.test.ts` documents).
 */
export function readableTextColorOn(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  // Rec.601 luma weights; 128 splits readable white-on from black-on text.
  // Pure #000000 rather than the former near-black #111111: Apple's `label` is
  // pure black, and an accent fill's label is a label.
  const yiq = (299 * r + 587 * g + 114 * b) / 1000
  return yiq >= 128 ? '#000000' : '#ffffff'
}

/** `#RRGGBB` → `rgba(r, g, b, alpha)` for the translucent paper token. */
export function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

/** Radius as a px string, clamped to the backend's own 0–100 validation range. */
function radiusVar(value: number | undefined): string | undefined {
  if (value == null || Number.isNaN(value) || value < 0 || value > 100) return undefined
  return `${value}px`
}

/**
 * Muse baseline for every token a pack may override, mirrored from
 * `tokens.css`'s `.theme-root.theme-<light|dark>` blocks. A gate test parses
 * the stylesheet and asserts this table against it — the two sources cannot
 * drift silently.
 */
export const PACK_OVERRIDABLE_BASELINE: Record<'light' | 'dark', Record<string, string>> = {
  light: {
    '--accent': '#0088ff',
    '--accent-content': '#ffffff',
    '--tint-fill': 'rgba(0, 136, 255, 0.1)',
    '--system-background': '#ffffff',
    '--secondary-system-background': '#f2f2f7',
    '--system-grouped-background': '#f2f2f7',
    '--secondary-system-grouped-background': '#ffffff',
    // Liquid Glass tokens. The four texture tokens (fill/fill-strong/border/
    // highlight) are always baseline — glass质感 is fixed, not pack-driven.
    // Only the decorative `--glass-glow*`/`--glass-sheen` re-point at seedColor
    // (see themePackToStyleVars), so a pack tints the glass sheen without
    // touching button ink (--primary stays its own channel).
    '--glass-fill': 'rgba(255, 255, 255, 0.85)',
    '--glass-fill-strong': 'rgba(255, 255, 255, 0.72)',
    '--glass-border': 'rgba(255, 255, 255, 0.45)',
    '--glass-highlight': 'rgba(255, 255, 255, 0.6)',
    '--glass-glow': '#3BAEEF',
    '--glass-glow-faint': 'rgba(59, 174, 239, 0.10)',
    '--glass-sheen': 'rgba(59, 174, 239, 0.1)',
    '--radius-lg': '20px',
    '--radius-md': '12px',
    '--radius-nav': '12px',
  },
  dark: {
    '--accent': '#0091ff',
    '--accent-content': '#ffffff',
    '--tint-fill': 'rgba(0, 145, 255, 0.18)',
    '--system-background': '#000000',
    '--secondary-system-background': '#1c1c1e',
    '--system-grouped-background': '#000000',
    '--secondary-system-grouped-background': '#1c1c1e',
    // Liquid Glass tokens — see the light block. Same shape, dark-tuned:
    // darker glass fills, dimmer highlight, and the dark star-blue glow.
    '--glass-fill': 'rgba(23, 23, 27, 0.85)',
    '--glass-fill-strong': 'rgba(23, 23, 27, 0.72)',
    '--glass-border': 'rgba(255, 255, 255, 0.16)',
    '--glass-highlight': 'rgba(255, 255, 255, 0.3)',
    '--glass-glow': '#5BC0F5',
    '--glass-glow-faint': 'rgba(91, 192, 245, 0.14)',
    '--glass-sheen': 'rgba(91, 192, 245, 0.04)',
    '--radius-lg': '20px',
    '--radius-md': '12px',
    '--radius-nav': '12px',
  },
}

/**
 * Map a pack onto inline CSS custom properties for the given resolved theme.
 *
 * The result always carries **every** overridable token (see the module
 * header): pack values where the pack supplies a valid one, the Muse baseline
 * everywhere else — so switching packs, clearing the active pack, or flipping
 * light/dark never depends on removing a previously-set property, which the
 * runtime's merge-only style diffs do not do.
 *
 * Invalid colors are dropped field-by-field, never whole-pack: a pack with a
 * malformed surfaceColor but a good seedColor still gets its accent applied.
 */
export function themePackToStyleVars(
  pack: ThemePackData | null | undefined,
  resolved: 'light' | 'dark',
): Record<string, string> {
  const colors = pack ? (resolved === 'light' ? pack.light : pack.dark) : undefined
  const vars: Record<string, string> = { ...PACK_OVERRIDABLE_BASELINE[resolved] }

  if (colors) {
    if (isHexColor(colors.seedColor)) {
      vars['--accent'] = colors.seedColor
      vars['--accent-content'] = readableTextColorOn(colors.seedColor)
      // The accent wash: tinted buttons, badges, and the selected/current row
      // states (the play-queue's active row, multi-select highlights). Brighter in
      // dark mode, where a low-alpha tint over dark surfaces needs more to stay
      // visible. These alphas now MATCH the baseline in `tokens.css` (0.10 light /
      // 0.18 dark) — they used to run two points above it for no stated reason,
      // which meant a pack's wash was always slightly heavier than the wash the
      // contrast gate had verified. The nav pill is NOT this token — it uses
      // --glass-glow-faint, and saying so here sent a batch looking in the wrong
      // place.
      //
      // The light alpha is bounded on BOTH sides and the window is narrow:
      // systemRed on a washed row needs <= 0.12, wash visibility needs >= 0.07.
      // A pack seed darker than systemBlue tightens the upper bound further, so
      // this is a place where a pack can leave the baseline's verified envelope —
      // see the plan's §2.4 note on what pack overrides can and cannot guarantee.
      vars['--tint-fill'] = hexToRgba(colors.seedColor, resolved === 'light' ? 0.1 : 0.18)
    }
    if (isHexColor(colors.glassColor)) {
      // Liquid Glass decorative tint — INDEPENDENT of seedColor (the button
      // channel). A pack colours its glass without recolouring its buttons:
      // true dual-channel. The three glass-glow tokens ride glassColor at the
      // same alpha split as the star-blue baseline (0.10/0.14 faint, 0.10/0.04
      // sheen). The sheen split changed when `--glass-sheen` gained its first
      // consumer: it now lies under text as a background layer, so its alpha is
      // part of the contrast budget (see the derivation in tokens.css) rather
      // than a free decorative number. It must stay in step with the baseline
      // there — a pack tinting its glass must not be able to out-saturate what
      // the gate verified. When glassColor is absent the baseline star-blue applies
      // (PACK_OVERRIDABLE_BASELINE already mirrors tokens.css), so glass stays
      // a different colour from buttons even with no pack. The four
      // glass-texture tokens (fill/border/highlight) are always baseline —
      // a pack colours the glass, it does not change its质感.
      vars['--glass-glow'] = colors.glassColor
      vars['--glass-glow-faint'] = hexToRgba(colors.glassColor, resolved === 'light' ? 0.1 : 0.14)
      vars['--glass-sheen'] = hexToRgba(colors.glassColor, resolved === 'light' ? 0.1 : 0.04)
    }
    // Both background groups take the pack's pair — see the module header for why
    // sending it only to the plain group would leave settings-style pages stranded
    // on the untouched Apple grey.
    if (isHexColor(colors.backgroundColor)) {
      vars['--system-background'] = colors.backgroundColor
      vars['--system-grouped-background'] = colors.backgroundColor
    }
    if (isHexColor(colors.surfaceColor)) {
      vars['--secondary-system-background'] = colors.surfaceColor
      vars['--secondary-system-grouped-background'] = colors.surfaceColor
    }
  }

  const cardRadius = radiusVar(pack?.cardRadius)
  if (cardRadius != null) vars['--radius-lg'] = cardRadius
  const controlRadius = radiusVar(pack?.controlRadius)
  if (controlRadius != null) vars['--radius-md'] = controlRadius
  const navigationRadius = radiusVar(pack?.navigationRadius)
  if (navigationRadius != null) vars['--radius-nav'] = navigationRadius

  const mt = MATERIAL_TOKENS[getMaterialVariant()][resolved]
  vars['--glass-fill'] = mt['--glass-fill']
  vars['--glass-fill-strong'] = mt['--glass-fill-strong']
  vars['--glass-border'] = mt['--glass-border']
  vars['--glass-highlight'] = mt['--glass-highlight']

  // --font-scale is kept for any direct consumer, but the 12 HIG font-size
  // tokens cannot rely on calc(Npx * var(--font-scale)) resolving the inline
  // override on iOS — nested var() inside a custom property's calc() does not
  // see inline overrides there (see docs/project/bugs.md). So we compute each
  // font-size token as a plain px value inline, bypassing the indirection.
  // The stylesheet declarations still serve as the fallback when no provider
  // has run yet (first paint before ThemeProvider mounts).
  const scale = getFontScaleNumber()
  vars['--font-scale'] = String(scale)
  for (const [token, basePx] of Object.entries(FONT_SIZE_BASES)) {
    vars[token] = `${basePx * scale}px`
  }

  return vars
}

/**
 * Base pixel sizes for the 12 HIG text-style tokens (before --font-scale).
 * Mirrors `tokens.css`'s `.theme-root` declarations; kept here so
 * `ThemeProvider` can emit computed px values inline and bypass the iOS bug
 * where nested var() inside calc() ignores inline custom-property overrides.
 *
 * Gate: `tokens-hig.test.ts` asserts these match the stylesheet bases.
 */
export const FONT_SIZE_BASES: Record<string, number> = {
  '--font-2xs': 10,
  '--font-caption2': 11,
  '--font-caption1': 12,
  '--font-footnote': 13,
  '--font-subhead': 15,
  '--font-callout': 16,
  '--font-body': 17,
  '--font-headline': 17,
  '--font-title3': 20,
  '--font-title2': 22,
  '--font-title1': 28,
  '--font-largeTitle': 34,
}
