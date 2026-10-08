import type { ThemePackData } from '../../../shared/theme/theme-pack-mapping.js'
import { CONTRAST_ACCENT, PACK_OVERRIDABLE_BASELINE } from '../../../shared/theme/theme-pack-mapping.js'
import { getSurfacePolicy } from '../../../shared/theme/surface-policy.js'
import type { ResolvedTheme } from '../../../shared/theme/theme-model.js'

/**
 * The `colors` half of the `songloft-theme` push — the host's real palette as
 * the WebView SDK's `common.js` consumes it: keys are the Flutter
 * `ColorScheme` field names (camelCase — the SDK turns them into
 * `--md-<kebab-case>` and `getColorScheme()` hands the object to plugins), and
 * every value must be `#RRGGBB`, the ONLY format the SDK's HEX_RE accepts.
 *
 * The mapping's shape mirrors the Flutter build's `pluginColorSchemeMap`
 * (plugin_color_scheme.dart) — same keys, because that table is the contract's
 * single naming source — but the VALUES come from this client's own Apple
 * semantic palette plus the pack overrides. This client has no
 * `ColorScheme.fromSeed`; what a plugin page should match is what this host
 * actually paints:
 *
 * | plugin token            | source                                       |
 * |-------------------------|----------------------------------------------|
 * | primary / onPrimary     | --accent / --accent-content (+ pack seed)    |
 * | secondary* / tertiary*   | derived from the same accent channel (this    |
 * |                         | host has exactly one accent — see below)     |
 * | error*                  | --system-red(-strong)                        |
 * | surface*                | background / secondary / fill tiers          |
 * | outline(-variant)       | --separator / --opaque-separator             |
 * | inverse*                | the light/dark inverted pair                 |
 *
 * **One accent channel, honestly reused.** A pack gives `seedColor` for the
 * accent; this client derives no tonal palette from it. Rather than invent
 * secondary/tertiary hues the host never renders, they derive from the same
 * accent with fixed lightness offsets — a pack still recolours every one of
 * them (what the plugin visually needs) while never claiming to be a Material
 * tonal system. Consequence worth stating: a plugin's `--md-secondary` is not
 * an independent hue here; if a pack wants true dual-hue Material output, the
 * Flutter client is where that renders.
 */

/** The keys the SDK's `common.js`/`getColorScheme()` contract names. */
export interface PluginColorScheme {
  primary: string
  onPrimary: string
  primaryContainer: string
  onPrimaryContainer: string
  secondary: string
  onSecondary: string
  secondaryContainer: string
  onSecondaryContainer: string
  tertiary: string
  onTertiary: string
  tertiaryContainer: string
  onTertiaryContainer: string
  error: string
  onError: string
  errorContainer: string
  onErrorContainer: string
  surface: string
  onSurface: string
  onSurfaceVariant: string
  surfaceDim: string
  surfaceBright: string
  surfaceContainerLowest: string
  surfaceContainerLow: string
  surfaceContainer: string
  surfaceContainerHigh: string
  surfaceContainerHighest: string
  outline: string
  outlineVariant: string
  inverseSurface: string
  onInverseSurface: string
  inversePrimary: string
}

/** This host's baseline for the keys a pack can move, per resolved theme. */
const BASELINE: Record<'light' | 'dark', PluginColorScheme> = {
  // Light: the Apple light palette verbatim from tokens.css / PACK_OVERRIDABLE_BASELINE.
  light: {
    primary: '#0088ff',
    onPrimary: '#ffffff',
    // Derived tones around the accent: container = 12% tint toward white.
    primaryContainer: '#cfe8ff',
    onPrimaryContainer: '#004577',
    secondary: '#4e6675',
    onSecondary: '#ffffff',
    secondaryContainer: '#d2e5f0',
    onSecondaryContainer: '#394c57',
    tertiary: '#5f5a73',
    onTertiary: '#ffffff',
    tertiaryContainer: '#e5e1f3',
    onTertiaryContainer: '#474258',
    error: '#ff383c',
    onError: '#ffffff',
    errorContainer: '#ffdfe0',
    onErrorContainer: '#93000a',
    // Background groups: plain page / card pair (this host maps both groups to
    // the same pair — see theme-pack-mapping's header for why).
    surface: '#ffffff',
    onSurface: '#000000',
    onSurfaceVariant: '#666670',
    surfaceDim: '#d9d9de',
    surfaceBright: '#ffffff',
    surfaceContainerLowest: '#ffffff',
    surfaceContainerLow: '#f7f7fa',
    surfaceContainer: '#f2f2f7',
    surfaceContainerHigh: '#eaeaf0',
    surfaceContainerHighest: '#e2e2e9',
    // Separator tiers: --separator (0.29 black, composited on white ≈ #d8d8dd)
    // and --opaque-separator.
    outline: '#6f6f78',
    outlineVariant: '#c6c6c8',
    // The inverted pair: dark surface / light label.
    inverseSurface: '#1c1c1e',
    onInverseSurface: '#f2f2f7',
    inversePrimary: '#0091ff',
  },
  // Dark: the Apple dark palette.
  dark: {
    primary: '#0091ff',
    onPrimary: '#ffffff',
    primaryContainer: '#00506f',
    onPrimaryContainer: '#cfe8ff',
    secondary: '#a1c0d1',
    onSecondary: '#0e1e28',
    secondaryContainer: '#2a414c',
    onSecondaryContainer: '#c4dbe8',
    tertiary: '#c8c3e0',
    onTertiary: '#302c42',
    tertiaryContainer: '#474258',
    onTertiaryContainer: '#e5e1f3',
    error: '#ff4245',
    onError: '#ffffff',
    errorContainer: '#93000a',
    onErrorContainer: '#ffdad6',
    surface: '#000000',
    onSurface: '#ffffff',
    onSurfaceVariant: '#c4c6d0',
    surfaceDim: '#000000',
    surfaceBright: '#37393e',
    surfaceContainerLowest: '#0c0e13',
    surfaceContainerLow: '#191c20',
    surfaceContainer: '#1d2024',
    surfaceContainerHigh: '#282a2f',
    surfaceContainerHighest: '#33353a',
    outline: '#8e9099',
    outlineVariant: '#44464e',
    inverseSurface: '#f2f2f7',
    onInverseSurface: '#1c1c1e',
    inversePrimary: '#0088ff',
  },
}

const HEX = /^#[0-9a-fA-F]{6}$/

/** Mix a hex colour toward white by `t` (0 = unchanged, 1 = white). */
function mixTowardWhite(hex: string, t: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  const mix = (c: number) => Math.round(c + (255 - c) * t)
  return `#${[mix(r), mix(g), mix(b)].map((c) => c.toString(16).padStart(2, '0')).join('')}`
}

/** Mix a hex colour toward black by `t` (0 = unchanged, 1 = black). */
function mixTowardBlack(hex: string, t: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  const mix = (c: number) => Math.round(c * (1 - t))
  return `#${[mix(r), mix(g), mix(b)].map((c) => c.toString(16).padStart(2, '0')).join('')}`
}

/**
 * The palette for the resolved theme. A pack's `seedColor` moves the whole
 * accent-derived family (primary/secondary/tertiary + containers), its
 * `backgroundColor`/`surfaceColor` move the page/card pair — the same two
 * reach both background groups (see theme-pack-mapping's header). Everything
 * else stays at this host's baseline. Invalid colours are skipped
 * field-by-field, never whole-pack.
 */
export function pluginColorSchemeMap(
  pack: ThemePackData | null | undefined,
  resolved: ResolvedTheme,
): PluginColorScheme {
  const out: PluginColorScheme = { ...BASELINE[resolved] }
  if (getSurfacePolicy().increaseContrast) {
    out.primary = CONTRAST_ACCENT[resolved].accent
    out.onPrimary = CONTRAST_ACCENT[resolved].accentContent
    if (resolved === 'light') out.error = '#e9152d'
  }
  const colors = pack ? (resolved === 'light' ? pack.light : pack.dark) : undefined
  if (!colors) return out

  const seedRaw = typeof colors.seedColor === 'string' ? colors.seedColor : null
  const seed = seedRaw && HEX.test(seedRaw) ? seedRaw : null
  if (seed) {
    out.primary = seed
    // onPrimary: white reads on any mid/dark seed; black on very light seeds.
    const r = parseInt(seed.slice(1, 3), 16)
    const g = parseInt(seed.slice(3, 5), 16)
    const b = parseInt(seed.slice(5, 7), 16)
    const yiq = (299 * r + 587 * g + 114 * b) / 1000
    out.onPrimary = yiq >= 128 ? '#000000' : '#ffffff'
    if (resolved === 'light') {
      out.primaryContainer = mixTowardWhite(seed, 0.78)
      out.onPrimaryContainer = mixTowardBlack(seed, 0.55)
      out.secondary = mixTowardBlack(seed, 0.35)
      out.secondaryContainer = mixTowardWhite(seed, 0.7)
      out.onSecondaryContainer = mixTowardBlack(seed, 0.45)
      out.tertiary = mixTowardBlack(seed, 0.2)
      out.tertiaryContainer = mixTowardWhite(seed, 0.82)
      out.onTertiaryContainer = mixTowardBlack(seed, 0.5)
      out.inversePrimary = mixTowardWhite(seed, 0.25)
    } else {
      out.primaryContainer = mixTowardBlack(seed, 0.55)
      out.onPrimaryContainer = mixTowardWhite(seed, 0.78)
      out.secondary = mixTowardWhite(seed, 0.4)
      out.secondaryContainer = mixTowardBlack(seed, 0.45)
      out.onSecondaryContainer = mixTowardWhite(seed, 0.7)
      out.tertiary = mixTowardWhite(seed, 0.25)
      out.tertiaryContainer = mixTowardBlack(seed, 0.4)
      out.onTertiaryContainer = mixTowardWhite(seed, 0.82)
      out.inversePrimary = mixTowardBlack(seed, 0.3)
    }
  }

  const bg = typeof colors.backgroundColor === 'string' && HEX.test(colors.backgroundColor)
    ? colors.backgroundColor
    : null
  if (bg) {
    out.surface = bg
    out.surfaceBright = bg
    out.surfaceDim = resolved === 'light'
      ? mixTowardBlack(bg, 0.12)
      : mixTowardWhite(bg, 0.18)
  }
  const surface = typeof colors.surfaceColor === 'string' && HEX.test(colors.surfaceColor)
    ? colors.surfaceColor
    : null
  if (surface) {
    out.surfaceContainer = surface
    // The container ladder around the pack's card colour: ±5% lightness steps,
    // same order as the baseline (low→highest climbs in light, darkens in dark).
    const step = 0.05
    out.surfaceContainerLow = resolved === 'light'
      ? mixTowardWhite(surface, step)
      : mixTowardBlack(surface, step)
    out.surfaceContainerHigh = resolved === 'light'
      ? mixTowardBlack(surface, step)
      : mixTowardWhite(surface, step)
    out.surfaceContainerHighest = resolved === 'light'
      ? mixTowardBlack(surface, step * 2)
      : mixTowardWhite(surface, step * 2)
    out.surfaceContainerLowest = resolved === 'light'
      ? mixTowardWhite(surface, step * 2)
      : mixTowardBlack(surface, step * 2)
  }
  return out
}
