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
  | 'chevron-left'
  | 'chevron-up'
  | 'chevron-right'
  | 'menu'
  | 'info'
  | 'logout'
  | 'link'
  | 'open-external'
  | 'copy'
  | 'palette'
  | 'check'
  | 'timer'
  | 'history'
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
  | 'cloud'
  | 'radio'
  | 'person'
  | 'album'
  | 'tag'
  | 'calendar'
  | 'grid'
  | 'list'
  | 'globe'
  | 'brush'
  | 'queue'
  | 'tune'
  | 'cast'
  | 'more'
  | 'eye'
  | 'edit'
  | 'trash'
  | 'pin'
  | 'download'
  | 'label'
  | 'arrow-up'
  | 'arrow-down'

/** Shared stroke attributes for line icons — Muse §4.5 stroke-width 1.6. */
function stroke(color: string): string {
  return `fill="none" stroke="${color}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"`
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

  // Gear cog — Feather Icons settings (feathericons.com).
  settings: (c) =>
    `<circle cx="12" cy="12" r="3" ${stroke(c)}/>` +
    `<path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" ${stroke(c)}/>`,

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

  'chevron-left': (c) => `<path d="M14.5 6 8.5 12 14.5 18" ${stroke(c)}/>`,

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
    `<path d="M12.5 17.5 11 19a4 4 0 0 1-6-6l1.5-1.5" ${stroke(c)}/>` ,

  // Open in an external app/browser: the standard box + outward arrow. The
  // plugin page's "open in browser" affordance (Flutter's Icons.open_in_new).
  'open-external': (c) =>
    `<path d="M14 4h6v6" ${stroke(c)}/>` +
    `<path d="M20 4l-8.5 8.5" ${stroke(c)}/>` +
    `<path d="M18.5 13.5V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5.5" ${stroke(c)}/>` ,

  // Copy: two overlapping sheets — the clipboard affordance on read-only URLs.
  copy: (c) =>
    `<rect x="9" y="9" width="11" height="11" rx="2" ${stroke(c)}/>` +
    `<path d="M5 15V5a2 2 0 0 1 2-2h10" ${stroke(c)}/>`,

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

  // History: a clock with a counter-clockwise arrow (the `timer` dial plus a
  // rewind arc), for "what was played here before".
  history: (c) =>
    `<path d="M3.5 12a8.5 8.5 0 1 0 2.8-6.3" ${stroke(c)}/>` +
    `<path d="M3 4.5V9h4.5" ${stroke(c)}/>` +
    `<path d="M12 8v4.5l3 2" ${stroke(c)}/>`,

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

  // ── Library browse views (batch 51) ───────────────────────────────────────

  // Cloud: remote songs.
  cloud: (c) =>
    `<path d="M7 18.5h10a4 4 0 0 0 .6-7.95 5.5 5.5 0 0 0-10.8 1.2A3.4 3.4 0 0 0 7 18.5Z" ${stroke(c)}/>`,

  // Radio waves: radio stations / radio playlists.
  radio: (c) =>
    `<circle cx="12" cy="12" r="2" ${stroke(c)}/>` +
    `<path d="M8.1 8.1a5.5 5.5 0 0 0 0 7.8M15.9 8.1a5.5 5.5 0 0 1 0 7.8" ${stroke(c)}/>` +
    `<path d="M5.3 5.3a9.5 9.5 0 0 0 0 13.4M18.7 5.3a9.5 9.5 0 0 1 0 13.4" ${stroke(c)}/>`,

  // Person: artist dimension.
  person: (c) =>
    `<circle cx="12" cy="8" r="3.5" ${stroke(c)}/>` +
    `<path d="M5 20c.8-3.4 3.6-5 7-5s6.2 1.6 7 5" ${stroke(c)}/>`,

  // Album: disc with center hole.
  album: (c) =>
    `<circle cx="12" cy="12" r="8.5" ${stroke(c)}/>` +
    `<circle cx="12" cy="12" r="2.5" ${stroke(c)}/>`,

  // Tag: genre dimension.
  tag: (c) =>
    `<path d="M4 4h8l8 8-8 8-8-8V4Z" ${stroke(c)}/>` +
    `<circle cx="8.5" cy="8.5" r="1.3" ${stroke(c)}/>`,

  // Calendar: year / decade dimensions.
  // Grid: 2×2 arrangement of squares (view toggle).
  grid: (c) =>
    `<rect x="3" y="3" width="8" height="8" rx="1.5" ${stroke(c)}/>` +
    `<rect x="13" y="3" width="8" height="8" rx="1.5" ${stroke(c)}/>` +
    `<rect x="3" y="13" width="8" height="8" rx="1.5" ${stroke(c)}/>` +
    `<rect x="13" y="13" width="8" height="8" rx="1.5" ${stroke(c)}/>`,

  // List: 3 horizontal bars (view toggle).
  list: (c) =>
    `<rect x="3" y="4" width="18" height="4" rx="1.5" ${stroke(c)}/>` +
    `<rect x="3" y="10" width="18" height="4" rx="1.5" ${stroke(c)}/>` +
    `<rect x="3" y="16" width="18" height="4" rx="1.5" ${stroke(c)}/>`,

  calendar: (c) =>
    `<rect x="4" y="5.5" width="16" height="15" rx="2" ${stroke(c)}/>` +
    `<path d="M4 10.5h16M8.5 3.5v4M15.5 3.5v4" ${stroke(c)}/>`,

  // Globe: language dimension.
  globe: (c) =>
    `<circle cx="12" cy="12" r="8.5" ${stroke(c)}/>` +
    `<path d="M3.5 12h17" ${stroke(c)}/>` +
    `<path d="M12 3.5c2.6 2.3 3.9 5.1 3.9 8.5s-1.3 6.2-3.9 8.5c-2.6-2.3-3.9-5.1-3.9-8.5s1.3-6.2 3.9-8.5Z" ${stroke(c)}/>`,

  // Brush: style dimension.
  brush: (c) =>
    `<path d="m14.5 3.5 6 6L10 20H4v-6l10.5-10.5Z" ${stroke(c)}/>` +
    `<path d="m12.5 5.5 6 6" ${stroke(c)}/>`,

  // Queue: playlist lines + beamed notes.
  queue: (c) =>
    `<path d="M4 6h16M4 10h16M4 14h8" ${stroke(c)}/>` +
    `<path d="M15 18.5v-7l5-1.2v7" ${stroke(c)}/>` +
    `<circle cx="13.4" cy="18.5" r="1.8" ${stroke(c)}/>` +
    `<circle cx="18.4" cy="17.3" r="1.8" ${stroke(c)}/>`,

  // Tune: three slider lines with knobs — "customize views" entry.
  tune: (c) =>
    `<path d="M3 6h18M3 12h18M3 18h18" ${stroke(c)}/>` +
    `<circle cx="15" cy="6" r="2.2" ${stroke(c)}/>` +
    `<circle cx="8" cy="12" r="2.2" ${stroke(c)}/>` +
    `<circle cx="17" cy="18" r="2.2" ${stroke(c)}/>`,

  // Cast: screen with signal arcs — DLNA / screen casting.
  cast: (c) =>
    `<path d="M2 16.1A5 5 0 0 1 5.9 20" ${stroke(c)}/>` +
    `<path d="M2 12.05A9 9 0 0 1 9.95 20" ${stroke(c)}/>` +
    `<path d="M2 8V6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-6" ${stroke(c)}/>` +
    `<path d="M2 20h.01" ${stroke(c)}/>`,

  // Overflow menu: three dots in a row. Filled rather than stroked — at 20px a
  // stroked 1.8px ring reads as a smudge instead of a dot.
  more: (c) =>
    `<circle cx="5" cy="12" r="1.9" ${fill(c)}/>` +
    `<circle cx="12" cy="12" r="1.9" ${fill(c)}/>` +
    `<circle cx="19" cy="12" r="1.9" ${fill(c)}/>`,

  // Eye: playlist visibility toggle (hide / show).
  eye: (c) =>
    `<path d="M2.5 12s3.2-6.5 9.5-6.5S21.5 12 21.5 12s-3.2 6.5-9.5 6.5S2.5 12 2.5 12Z" ${stroke(c)}/>` +
    `<circle cx="12" cy="12" r="2.8" ${stroke(c)}/>`,

  // Pencil — marks the "custom value" chips in the sleep-timer sheet, as
  // `Icons.edit_outlined` does in the Flutter build.
  edit: (c) =>
    `<path d="M4 20h4l10-10-4-4L4 16v4Z" ${stroke(c)}/>` +
    `<path d="M14.5 5.5 18.5 9.5" ${stroke(c)}/>`,

  // Trash can — the header's "clear history" button, as `Icons
  // .delete_outline_rounded` in the Flutter play-history sheet.
  trash: (c) =>
    `<path d="M4 7h16" ${stroke(c)}/>` +
    `<path d="M9.5 7V5.2A1.2 1.2 0 0 1 10.7 4h2.6a1.2 1.2 0 0 1 1.2 1.2V7" ${stroke(c)}/>` +
    `<path d="M6.5 7l.8 12a2 2 0 0 0 2 1.9h5.4a2 2 0 0 0 2-1.9L17.5 7" ${stroke(c)}/>` +
    `<path d="M10 11v6M14 11v6" ${stroke(c)}/>`,

  // Push pin, upright: round head, tapered shaft, cross-bar under the head.
  // Marks (and toggles) a pinned playlist.
  pin: (c) =>
    `<circle cx="12" cy="7" r="3.4" ${stroke(c)}/>` +
    `<path d="M7.5 10.6h9" ${stroke(c)}/>` +
    `<path d="M12 14v7" ${stroke(c)}/>`,

  // Down-arrow into a tray — "cache on this device".
  download: (c) =>
    `<path d="M12 3.5v10.5" ${stroke(c)}/>` +
    `<path d="M8 10.5 12 14.5l4-4" ${stroke(c)}/>` +
    `<path d="M4.5 16.5v2A2 2 0 0 0 6.5 20.5h11a2 2 0 0 0 2-2v-2" ${stroke(c)}/>`,

  // Arrow up: sort ascending indicator.
  'arrow-up': (c) =>
    `<path d="M12 19V5" ${stroke(c)}/>` +
    `<path d="M5 12l7-7 7 7" ${stroke(c)}/>`,

  // Arrow down: sort descending indicator.
  'arrow-down': (c) =>
    `<path d="M12 5v14" ${stroke(c)}/>` +
    `<path d="M19 12l-7 7-7-7" ${stroke(c)}/>`,

  // Label: custom song tag (distinct from genre `tag`).
  label: (c) =>
    `<path d="M3 7.5A2.5 2.5 0 0 1 5.5 5h7.586a1 1 0 0 1 .707.293l6.914 6.914a1 1 0 0 1 0 1.414l-7.5 7.5a1 1 0 0 1-1.414 0L4.879 14.207A2.5 2.5 0 0 1 4 12.378V7.5Z" ${stroke(c)}/>` +
    `<circle cx="8" cy="9" r="1.2" fill="${c}" stroke="none"/>`,
}

/** Build a complete inline SVG document string for `name`, colored with `color`. */
export function buildSvg(name: IconName, color: string): string {
  const body = ICONS[name](color)
  return `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">${body}</svg>`
}
