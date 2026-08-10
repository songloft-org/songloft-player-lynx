import { getAppTheme, resolveTheme, type ResolvedTheme } from '../theme/theme-model.js'
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
  dark: {
    primary: '#7c5cff', // --primary
    primaryContent: '#ffffff', // --primary-content
    content: '#f5f5f7', // --content
    content2: '#c7c7d1', // --content-2
    contentMuted: '#8b8b98', // --content-muted
    danger: '#ff6b6b', // --danger
  },
  light: {
    primary: '#6a49f2', // --primary
    primaryContent: '#ffffff', // --primary-content
    content: '#16161d', // --content
    content2: '#4a4a57', // --content-2
    contentMuted: '#7b7b88', // --content-muted
    danger: '#d64545', // --danger
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

export interface IconProps {
  name: IconName
  /** Rendered box size in px (width = height). Defaults to 24. */
  size?: number
  /** Concrete color injected into the SVG's fill/stroke. Defaults to `content`. */
  color?: string
}

/**
 * Vector icon backed by the native Lynx `<svg>` element (Android/iOS/Harmony).
 *
 * Renders inline SVG markup via `content` with an explicitly-resolved box size
 * (`style.width/height`), per the `<svg>` element contract. `data-icon` carries
 * the icon name and `data-testid="icon-<name>"` makes the glyph queryable in
 * render tests without leaning on emoji text.
 */
export function Icon({ name, size = 24, color = ICON_COLORS.content }: IconProps) {
  return (
    <svg
      data-icon={name}
      data-testid={`icon-${name}`}
      content={buildSvg(name, color)}
      style={{ width: `${size}px`, height: `${size}px` }}
    />
  )
}
