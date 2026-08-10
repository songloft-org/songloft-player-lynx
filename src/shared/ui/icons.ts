/**
 * Vector icon registry for the Lynx `<svg>` element.
 *
 * Each icon is a 24×24 `viewBox` glyph, self-drawn in a Feather/Lucide-inspired
 * linear style (no copied third-party assets). Line icons use `stroke` with
 * `fill="none"`; solid transport glyphs (play/pause/skip) use `fill`.
 *
 * Coloring: Lynx renders `<svg content>` markup natively, outside the CSS
 * cascade, so CSS `var(--…)` / `currentColor` do **not** resolve against the
 * markup. We therefore inject a concrete color string into each element's
 * `fill`/`stroke` at build time (see `buildSvg`). The typed `current-color`
 * prop (iOS/Android/Harmony) could resolve a literal `currentColor` token, but
 * explicit injection is the portable, testable choice and is what we ship.
 */

export type IconName =
  | 'home'
  | 'library'
  | 'music'
  | 'settings'
  | 'play'
  | 'pause'
  | 'skip-prev'
  | 'skip-next'
  | 'shuffle'
  | 'repeat'
  | 'repeat-one'
  | 'order'
  | 'volume'
  | 'volume-mute'
  | 'chevron-down'
  | 'chevron-right'
  | 'menu'
  | 'info'
  | 'logout'
  | 'link'
  | 'palette'
  | 'check'
  | 'timer'
  | 'x'
  | 'plus'

/** Shared stroke attributes for line icons. */
function stroke(color: string): string {
  return `fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"`
}

/** Shared fill attribute for solid icons. */
function fill(color: string): string {
  return `fill="${color}"`
}

/**
 * Registry: each entry returns the inner SVG markup (paths/shapes) with the
 * requested color already injected into every `fill`/`stroke`.
 */
const ICONS: Record<IconName, (color: string) => string> = {
  home: (c) =>
    `<path d="M3 10.8 12 3l9 7.8" ${stroke(c)}/>` +
    `<path d="M5.5 9.5V21h4.5v-6h4v6h4.5V9.5" ${stroke(c)}/>`,

  // Musical note (beamed eighths) — used for Library nav + cover/lyric fallback.
  library: (c) =>
    `<path d="M9 18V5l11-2v13" ${stroke(c)}/>` +
    `<circle cx="6" cy="18" r="3" ${stroke(c)}/>` +
    `<circle cx="17" cy="16" r="3" ${stroke(c)}/>`,
  music: (c) =>
    `<path d="M9 18V5l11-2v13" ${stroke(c)}/>` +
    `<circle cx="6" cy="18" r="3" ${stroke(c)}/>` +
    `<circle cx="17" cy="16" r="3" ${stroke(c)}/>`,

  settings: (c) =>
    `<circle cx="12" cy="12" r="3.4" ${stroke(c)}/>` +
    `<path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3` +
    `M4.9 4.9l2.1 2.1M16.9 16.9l2.1 2.1M4.9 19.1l2.1-2.1M16.9 7.1l2.1-2.1" ${stroke(c)}/>`,

  play: (c) => `<path d="M7 4.5v15l12-7.5z" ${fill(c)}/>`,

  pause: (c) =>
    `<rect x="6.5" y="4.5" width="4" height="15" rx="1" ${fill(c)}/>` +
    `<rect x="13.5" y="4.5" width="4" height="15" rx="1" ${fill(c)}/>`,

  'skip-prev': (c) =>
    `<path d="M18 5v14l-10-7z" ${fill(c)}/>` +
    `<rect x="5.5" y="5" width="2.6" height="14" rx="1" ${fill(c)}/>`,

  'skip-next': (c) =>
    `<path d="M6 5v14l10-7z" ${fill(c)}/>` +
    `<rect x="15.9" y="5" width="2.6" height="14" rx="1" ${fill(c)}/>`,

  shuffle: (c) =>
    `<path d="M4 6h3.2l9.6 12H21" ${stroke(c)}/>` +
    `<path d="M17.5 3.5 21 6l-3.5 2.5" ${stroke(c)}/>` +
    `<path d="M4 18h3.2l2.6-3.2" ${stroke(c)}/>` +
    `<path d="M14.4 9.2 16.8 6" ${stroke(c)}/>` +
    `<path d="M17.5 15.5 21 18l-3.5 2.5" ${stroke(c)}/>`,

  repeat: (c) =>
    `<path d="M17 2.5 21 6.5l-4 4" ${stroke(c)}/>` +
    `<path d="M3 11.5V9a4 4 0 0 1 4-4h14" ${stroke(c)}/>` +
    `<path d="M7 21.5 3 17.5l4-4" ${stroke(c)}/>` +
    `<path d="M21 12.5V15a4 4 0 0 1-4 4H3" ${stroke(c)}/>`,

  'repeat-one': (c) =>
    `<path d="M17 2.5 21 6.5l-4 4" ${stroke(c)}/>` +
    `<path d="M3 11.5V9a4 4 0 0 1 4-4h14" ${stroke(c)}/>` +
    `<path d="M7 21.5 3 17.5l4-4" ${stroke(c)}/>` +
    `<path d="M21 12.5V15a4 4 0 0 1-4 4H3" ${stroke(c)}/>` +
    `<path d="M12 14.5v-5l-1.6 1.1" ${stroke(c)}/>`,

  // Sequential playback (play in order): a simple right arrow.
  order: (c) =>
    `<path d="M4 12h14" ${stroke(c)}/>` +
    `<path d="M13 6l6 6-6 6" ${stroke(c)}/>`,

  volume: (c) =>
    `<path d="M4 9.5v5h3.5L13 19V5L7.5 9.5z" ${fill(c)}/>` +
    `<path d="M16.5 8.5a5 5 0 0 1 0 7" ${stroke(c)}/>` +
    `<path d="M19 6a8.5 8.5 0 0 1 0 12" ${stroke(c)}/>`,

  'volume-mute': (c) =>
    `<path d="M4 9.5v5h3.5L13 19V5L7.5 9.5z" ${fill(c)}/>` +
    `<path d="M16.5 9.5 21.5 14.5M21.5 9.5 16.5 14.5" ${stroke(c)}/>`,

  'chevron-down': (c) => `<path d="M6 9.5 12 15.5 18 9.5" ${stroke(c)}/>`,

  'chevron-right': (c) => `<path d="M9.5 6 15.5 12 9.5 18" ${stroke(c)}/>`,

  menu: (c) => `<path d="M4 6h16M4 12h16M4 18h16" ${stroke(c)}/>`,

  // Info: circled "i".
  info: (c) =>
    `<circle cx="12" cy="12" r="9" ${stroke(c)}/>` +
    `<path d="M12 11v5" ${stroke(c)}/>` +
    `<path d="M12 7.6v.2" ${stroke(c)}/>`,

  // Sign out: door + outward arrow.
  logout: (c) =>
    `<path d="M15 4h4v16h-4" ${stroke(c)}/>` +
    `<path d="M4 12h11" ${stroke(c)}/>` +
    `<path d="M9 7l-5 5 5 5" ${stroke(c)}/>`,

  // Link / connection: two chain links.
  link: (c) =>
    `<path d="M9 15 15 9" ${stroke(c)}/>` +
    `<path d="M11.5 6.5 13 5a4 4 0 0 1 6 6l-1.5 1.5" ${stroke(c)}/>` +
    `<path d="M12.5 17.5 11 19a4 4 0 0 1-6-6l1.5-1.5" ${stroke(c)}/>`,

  // Palette: appearance / theme.
  palette: (c) =>
    `<path d="M12 3a9 9 0 0 0 0 18c1 0 1.6-.8 1.6-1.7 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.1 0-.9.7-1.6 1.6-1.6H16a5 5 0 0 0 5-5c0-4.1-4-7.4-9-7.4z" ${stroke(c)}/>` +
    `<circle cx="7.5" cy="11.5" r="1" ${fill(c)}/>` +
    `<circle cx="11" cy="7.5" r="1" ${fill(c)}/>` +
    `<circle cx="15.5" cy="8.5" r="1" ${fill(c)}/>`,

  check: (c) => `<path d="M5 12.5 10 17.5 19 6.5" ${stroke(c)}/>`,

  timer: (c) =>
    `<circle cx="12" cy="12" r="9" ${stroke(c)}/>` +
    `<path d="M12 7v5l3.5 3.5" ${stroke(c)}/>`,

  x: (c) => `<path d="M6 6 18 18M18 6 6 18" ${stroke(c)}/>`,

  plus: (c) => `<path d="M12 5v14M5 12h14" ${stroke(c)}/>`,
}

/** Build a complete inline SVG document string for `name`, colored with `color`. */
export function buildSvg(name: IconName, color: string): string {
  const body = ICONS[name](color)
  return `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">${body}</svg>`
}
