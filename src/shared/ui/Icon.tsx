import { getAppTheme, resolveTheme, type ResolvedTheme } from '../theme/theme-model.js'
import { getActiveThemePack } from '../theme/theme-pack-model.js'
import { isHexColor } from '../theme/theme-pack-mapping.js'
import { buildSvg, type IconName } from './icons.js'

/**
 * Icon color palettes, mirroring the LUNA tokens in `src/shared/theme/tokens.css`.
 *
 * `<svg content>` markup is rendered natively and is not reached by the CSS
 * cascade, so these must be concrete values injected into the SVG (see
 * `icons.ts`), not `var(--…)` references. Keep each palette in sync with the
 * matching `.theme-<name>` block in `tokens.css`.
 */
const PALETTES: Record<ResolvedTheme, {
  primary: string
  primaryContent: string
  content: string
  content2: string
  contentMuted: string
  danger: string
}> = {
  // Keep in sync with tokens.css `.theme-dark` — `<svg content>` is outside the
  // CSS cascade (see icons.ts). `primary` is the accent (systemBlue), the value
  // `activeAccentIconColor()` falls back to without a theme pack.
  dark: {
    primary: '#0091ff', // --accent
    primaryContent: '#ffffff', // --accent-content
    content: '#f5f5f7', // --content
    content2: '#a1a1a8', // --content-2
    contentMuted: '#8b8b98', // --content-muted (AA-brightened; see tokens.css)
    danger: '#ff6b6b', // --danger (AA-brightened for dark)
  },
  // Light accent = systemBlue (see tokens.css `.theme-light`).
  light: {
    primary: '#0088ff', // --accent
    primaryContent: '#ffffff', // --accent-content
    content: '#111111', // --content
    content2: '#67676f', // --content-2
    contentMuted: '#7b7b88', // --content-muted (AA-deepened; see tokens.css)
    danger: '#d64545', // --danger (Muse brick red)
  },
}

/**
 * Icon color constants. Reads the *current* theme on every property access
 * (a `Proxy`, not a snapshot), so `ICON_COLORS.primary` etc. always reflect
 * the live theme without requiring any of the ~20 call sites across the
 * codebase to change — they already re-render top-to-bottom whenever
 * `ThemeProvider`'s state flips (ordinary, non-memoized React components).
 * `Proxy` is a standard ES2015 language feature, not a browser/DOM API, so it
 * is unaffected by the Lynx no-DOM rules in AGENTS §3.
 */
export const ICON_COLORS: (typeof PALETTES)['dark'] = new Proxy(
  {} as (typeof PALETTES)['dark'],
  {
    get(_target, prop: keyof (typeof PALETTES)['dark']) {
      return PALETTES[resolveTheme(getAppTheme())][prop]
    },
  },
)

/**
 * The tint color for ACTIVE nav glyphs — the accent the nav's tint style needs.
 *
 * A pack's seedColor arrives as inline CSS custom properties (`--accent` etc.),
 * which `<svg content>` markup cannot read (it sits outside the cascade), so
 * the hex must be resolved at render time instead. Falls back to the Muse ink
 * accent — exactly what `--accent` holds without a pack.
 *
 * Read per call like the ICON_COLORS proxy above: ThemeProvider's pack
 * subscription re-renders the tree top-to-bottom on activation, so every
 * caller picks up a pack switch without subscribing itself.
 */
export function activeAccentIconColor(): string {
  const theme = resolveTheme(getAppTheme())
  const seed = getActiveThemePack()?.data?.[theme]?.seedColor
  return isHexColor(seed) ? seed : PALETTES[theme].primary
}

export interface IconProps {
  name: IconName
  /** Rendered box size in px (width = height). Defaults to 24. */
  size?: number
  /** Concrete color injected into the SVG's fill/stroke. Defaults to `content`. */
  color?: string
  /** Overrides the generated `icon-<name>` testid — for screens with several `more` glyphs. */
  testId?: string
}

/**
 * Vector icon backed by the native Lynx `<svg>` element (Android/iOS/Harmony).
 *
 * Renders inline SVG markup via `content` with an explicitly-resolved box size
 * (`style.width/height`), per the `<svg>` element contract. `data-icon` carries
 * the icon name and `data-testid="icon-<name>"` makes the glyph queryable in
 * render tests without leaning on emoji text.
 */
export function Icon({ name, size = 24, color = ICON_COLORS.content, testId }: IconProps) {
  return (
    <svg
      data-icon={name}
      data-testid={testId ?? `icon-${name}`}
      content={buildSvg(name, color)}
      style={{ width: `${size}px`, height: `${size}px` }}
    />
  )
}
