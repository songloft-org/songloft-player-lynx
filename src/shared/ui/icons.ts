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
  | 'chevron-up'
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
  | 'heart'
  | 'heart-filled'
  | 'sort'
  | 'refresh'
  | 'folder'
  | 'folder-open'
  | 'search'
  | 'stop'
  | 'warning'
  | 'check-circle'
  | 'fingerprint'

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
    `<circle cx="12" cy="12" r="3" ${stroke(c)}/>` +
    `<path d="M12 1l-1.5 3.2A7.8 7.8 0 0 0 8.2 5.5L5 4l-1 1.7 2.9 3.1a7.9 7.9 0 0 0 0 6.4L4 18.3 5 20l3.2-1.5a7.8 7.8 0 0 0 2.3 1.3L12 23l1.5-3.2a7.8 7.8 0 0 0 2.3-1.3L19 20l1-1.7-2.9-3.1a7.9 7.9 0 0 0 0-6.4L20 5.7 19 4l-3.2 1.5a7.8 7.8 0 0 0-2.3-1.3z" ${stroke(c)}/>`,

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

  'chevron-up': (c) => `<path d="M6 14.5 12 8.5 18 14.5" ${stroke(c)}/>`,

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

  heart: (c) =>
    `<path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" ${stroke(c)}/>`,

  'heart-filled': (c) =>
    `<path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" ${fill(c)}/>`,

  sort: (c) =>
    `<path d="M3 6h13" ${stroke(c)}/>` +
    `<path d="M3 12h9" ${stroke(c)}/>` +
    `<path d="M3 18h5" ${stroke(c)}/>` +
    `<path d="M17 4v14M17 18l4-4M17 18l-4-4" ${stroke(c)}/>`,

  refresh: (c) =>
    `<path d="M4 12a8 8 0 0 1 14.9-4.2M20 12a8 8 0 0 1-14.9 4.2" ${stroke(c)}/>` +
    `<path d="M19 3v5h-5" ${stroke(c)}/>` +
    `<path d="M5 21v-5h5" ${stroke(c)}/>`,

  // Folder (closed): tab on the top-left, body below.
  folder: (c) =>
    `<path d="M3 7.5a1.5 1.5 0 0 1 1.5-1.5h4l2 2.5h8A1.5 1.5 0 0 1 20 10v7.5a1.5 1.5 0 0 1-1.5 1.5h-14A1.5 1.5 0 0 1 3 17.5z" ${stroke(c)}/>`,

  // Folder (open): same tab, body skewed forward to read as "expanded".
  'folder-open': (c) =>
    `<path d="M3 7.5a1.5 1.5 0 0 1 1.5-1.5h4l2 2.5h8A1.5 1.5 0 0 1 20 10v1.5" ${stroke(c)}/>` +
    `<path d="M3 17.5V9.5h2.5l2.2 8H4.5A1.5 1.5 0 0 1 3 17.5z" ${stroke(c)}/>` +
    `<path d="M7.7 17.5 5.5 9.5H21l-2.2 8z" ${stroke(c)}/>`,

  // Magnifier: scan / start-scan action.
  search: (c) =>
    `<circle cx="10.5" cy="10.5" r="6.5" ${stroke(c)}/>` +
    `<path d="M15.5 15.5 21 21" ${stroke(c)}/>`,

  // Stop: circled square (cancel a running job).
  stop: (c) =>
    `<circle cx="12" cy="12" r="9" ${stroke(c)}/>` +
    `<path d="M9.5 9.5h5v5h-5z" ${stroke(c)}/>`,

  // Warning: triangle with a bang. Color it with `ICON_COLORS.danger` — there is
  // no dedicated warning slot in the theme.
  warning: (c) =>
    `<path d="M12 4 21 19.5H3z" ${stroke(c)}/>` +
    `<path d="M12 10v4.5" ${stroke(c)}/>` +
    `<path d="M12 17.1v.2" ${stroke(c)}/>`,

  // Circled check: a *status* badge (plain `check` means "selected").
  'check-circle': (c) =>
    `<circle cx="12" cy="12" r="9" ${stroke(c)}/>` +
    `<path d="M8 12.5 11 15.5 16.5 9.5" ${stroke(c)}/>`,

  // Fingerprint: nested arcs (audio-fingerprint setting).
  fingerprint: (c) =>
    `<path d="M12 4a8 8 0 0 0-8 8v2" ${stroke(c)}/>` +
    `<path d="M20 14v-2a8 8 0 0 0-4-6.9" ${stroke(c)}/>` +
    `<path d="M8 13a4 4 0 0 1 8 0v3" ${stroke(c)}/>` +
    `<path d="M12 13v6" ${stroke(c)}/>` +
    `<path d="M8 17v2" ${stroke(c)}/>` +
    `<path d="M16 19v1" ${stroke(c)}/>`,
}

/** Build a complete inline SVG document string for `name`, colored with `color`. */
export function buildSvg(name: IconName, color: string): string {
  const body = ICONS[name](color)
  return `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">${body}</svg>`
}
