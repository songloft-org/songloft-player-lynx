/**
 * Settings domain — pure, framework-free helpers shared by the settings pages
 * and unit tests. No Lynx runtime globals, no stores, no I/O.
 *
 * This batch ports only the *self-contained* slice of the Flutter settings
 * surface (about/version, log out, server-address switch, default play mode).
 * The rest of the Flutter settings categories depend on capabilities not yet
 * built (scan/cache/upgrade ops, plugin registry, downloads, licenses, i18n)
 * and are deferred — see PROGRESS.
 */
import { playMode, playModes, type PlayMode } from '../../../core/config/constants.js'
import type { IconName } from '../../../shared/ui/icons.js'

/** Ordered list of selectable default play modes (mirrors `playModes`). */
export const PLAY_MODE_OPTIONS: readonly PlayMode[] = playModes

/** Human label for a play mode (Settings → Playback default-mode selector). */
export function playModeLabel(mode: PlayMode): string {
  switch (mode) {
    case playMode.order:
      return 'Play in order'
    case playMode.loop:
      return 'Repeat all'
    case playMode.single:
      return 'Repeat one'
    case playMode.random:
      return 'Shuffle'
    default:
      return 'Play in order'
  }
}

/** Short description for a play mode option row. */
export function playModeDescription(mode: PlayMode): string {
  switch (mode) {
    case playMode.order:
      return 'Stop after the last track'
    case playMode.loop:
      return 'Loop the whole queue'
    case playMode.single:
      return 'Repeat the current track'
    case playMode.random:
      return 'Play the queue in random order'
    default:
      return ''
  }
}

/** Icon for a play mode (reuses the transport-control glyphs). */
export function playModeIcon(mode: PlayMode): IconName {
  switch (mode) {
    case playMode.order:
      return 'order'
    case playMode.loop:
      return 'repeat'
    case playMode.single:
      return 'repeat-one'
    case playMode.random:
      return 'shuffle'
    default:
      return 'order'
  }
}

/**
 * Coerce an arbitrary persisted string into a valid {@link PlayMode}, falling
 * back to `order`. Mirrors the zod `.catch()` tolerance rule (AGENTS §2): a
 * corrupt/absent pref must never throw, just default.
 */
export function coercePlayMode(raw: string | null | undefined): PlayMode {
  return playModes.includes(raw as PlayMode) ? (raw as PlayMode) : playMode.order
}

/**
 * Label describing the current server connection, for the About/Connection
 * rows. Embedded builds hide the address entirely (same-origin backend).
 */
export function serverDisplay(baseUrl: string, isEmbedded: boolean): string {
  if (isEmbedded) return 'Songloft (embedded)'
  const trimmed = baseUrl.trim()
  return trimmed.length > 0 ? trimmed : 'Not configured'
}
