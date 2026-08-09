import { buildSvg, type IconName } from './icons.js'

/**
 * Icon color constants, mirroring the LUNA tokens in `src/shared/theme/tokens.css`.
 *
 * `<svg content>` markup is rendered natively and is not reached by the CSS
 * cascade, so these must be concrete values injected into the SVG (see
 * `icons.ts`), not `var(--…)` references. Keep in sync with `tokens.css`.
 */
export const ICON_COLORS = {
  primary: '#7c5cff', // --primary
  primaryContent: '#ffffff', // --primary-content
  content: '#f5f5f7', // --content
  content2: '#c7c7d1', // --content-2
  contentMuted: '#8b8b98', // --content-muted
  danger: '#ff6b6b', // --danger
} as const

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
