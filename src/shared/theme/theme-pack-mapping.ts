import { getFontScaleNumber } from './font-scale-model.js'
import { getMaterialVariant } from './material-model.js'
import { MATERIAL_TOKENS } from './material-tokens.js'

/**
 * Theme-pack → Muse token mapping (pure functions).
 *
 * The backend's theme-pack schema (`models.ThemePackData` in the Go service) is
 * Material-flavoured: `seedColor` feeds Flutter's `ColorScheme.fromSeed`, which
 * sprays a whole tonal palette. This client deliberately does NOT port
 * fromSeed — Muse is a single-accent system (DESIGN.md). Instead we make a
 * minimal honest mapping onto the existing tokens:
 *
 * | pack field                | token(s)                          |
 * |---------------------------|-----------------------------------|
 * | light/dark.seedColor      | --primary --primary-2 --accent    |
 * | (derived from seedColor)  | --primary-content (YIQ black/white) |
 * | (derived from seedColor)  | --primary-faint (10%/14% alpha wash) |
 * | light/dark.backgroundColor| --canvas                         |
 * | light/dark.surfaceColor   | --paper --paper-clear (90% alpha) |
 * | light/dark.glassColor     | --glass-glow (solid)              |
 * | (derived from glassColor) | --glass-glow-faint (0.10/0.14)     |
 * | (derived from glassColor) | --glass-sheen (0.18/0.10)         |
 * | (baseline, not pack-driven)| --glass-fill/fill-strong/border/   |
 * |                           |   highlight                        |
 * | cardRadius                | --radius-lg                      |
 * | controlRadius             | --radius-md                      |
 * | navigationRadius          | --radius-nav (legacy: the nav bar |
 * |                           | is a fixed capsule now; the token |
 * |                           | is kept for schema compat but has |
 * |                           | no consumer)                     |
 *
 * `--content*` / `--danger*` / `--line*` / `--player-scrim-*` stay at their
 * Muse baseline: the pack schema has no field for them, and the baseline is the
 * implicit contrast floor (`contrast.test.ts` gates it). The scrim alphas in
 * `tokens.css` are *computed* against the baseline canvas — repainting them
 * with a pack colour would break that derivation, so they are never overridden.
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
  const yiq = (299 * r + 587 * g + 114 * b) / 1000
  return yiq >= 128 ? '#111111' : '#ffffff'
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
    '--primary': '#111111',
    '--primary-2': '#111111',
    '--accent': '#111111',
    '--primary-content': '#ffffff',
    '--primary-faint': 'rgba(17, 17, 17, 0.08)',
    '--canvas': '#ffffff',
    '--paper': '#fafafa',
    '--paper-clear': 'rgba(255, 255, 255, 0.9)',
    // Liquid Glass tokens. The four texture tokens (fill/fill-strong/border/
    // highlight) are always baseline — glass质感 is fixed, not pack-driven.
    // Only the decorative `--glass-glow*`/`--glass-sheen` re-point at seedColor
    // (see themePackToStyleVars), so a pack tints the glass sheen without
    // touching button ink (--primary stays its own channel).
    '--glass-fill': 'rgba(255, 255, 255, 0.85)',
    '--glass-fill-strong': 'rgba(255, 255, 255, 0.72)',
    '--glass-border': 'rgba(255, 255, 255, 0.45)',
    '--glass-highlight': 'rgba(255, 255, 255, 0.22)',
    '--glass-glow': '#3BAEEF',
    '--glass-glow-faint': 'rgba(59, 174, 239, 0.10)',
    '--glass-sheen': 'rgba(59, 174, 239, 0.18)',
    '--radius-lg': '20px',
    '--radius-md': '12px',
    '--radius-nav': '12px',
  },
  dark: {
    '--primary': '#ffffff',
    '--primary-2': '#ffffff',
    '--accent': '#ffffff',
    '--primary-content': '#0f0f11',
    '--primary-faint': 'rgba(255, 255, 255, 0.12)',
    '--canvas': '#0f0f11',
    '--paper': '#17171b',
    '--paper-clear': 'rgba(23, 23, 27, 0.9)',
    // Liquid Glass tokens — see the light block. Same shape, dark-tuned:
    // darker glass fills, dimmer highlight, and the dark star-blue glow.
    '--glass-fill': 'rgba(23, 23, 27, 0.85)',
    '--glass-fill-strong': 'rgba(23, 23, 27, 0.72)',
    '--glass-border': 'rgba(255, 255, 255, 0.16)',
    '--glass-highlight': 'rgba(255, 255, 255, 0.08)',
    '--glass-glow': '#5BC0F5',
    '--glass-glow-faint': 'rgba(91, 192, 245, 0.14)',
    '--glass-sheen': 'rgba(91, 192, 245, 0.10)',
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
      vars['--primary'] = colors.seedColor
      vars['--primary-2'] = colors.seedColor
      vars['--accent'] = colors.seedColor
      vars['--primary-content'] = readableTextColorOn(colors.seedColor)
      // Selected-nav-pill wash: brighter in dark mode, where a low-alpha tint
      // over dark surfaces needs more to stay visible (matches the baseline's
      // 8% light / 12% dark split).
      vars['--primary-faint'] = hexToRgba(colors.seedColor, resolved === 'light' ? 0.1 : 0.14)
    }
    if (isHexColor(colors.glassColor)) {
      // Liquid Glass decorative tint — INDEPENDENT of seedColor (the button
      // channel). A pack colours its glass without recolouring its buttons:
      // true dual-channel. The three glass-glow tokens ride glassColor at the
      // same alpha split as the star-blue baseline (0.10/0.14 faint, 0.18/0.10
      // sheen). When glassColor is absent the baseline star-blue applies
      // (PACK_OVERRIDABLE_BASELINE already mirrors tokens.css), so glass stays
      // a different colour from buttons even with no pack. The four
      // glass-texture tokens (fill/border/highlight) are always baseline —
      // a pack colours the glass, it does not change its质感.
      vars['--glass-glow'] = colors.glassColor
      vars['--glass-glow-faint'] = hexToRgba(colors.glassColor, resolved === 'light' ? 0.1 : 0.14)
      vars['--glass-sheen'] = hexToRgba(colors.glassColor, resolved === 'light' ? 0.18 : 0.1)
    }
    if (isHexColor(colors.backgroundColor)) {
      vars['--canvas'] = colors.backgroundColor
    }
    if (isHexColor(colors.surfaceColor)) {
      vars['--paper'] = colors.surfaceColor
      vars['--paper-clear'] = hexToRgba(colors.surfaceColor, 0.9)
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

  vars['--font-scale'] = String(getFontScaleNumber())

  return vars
}
