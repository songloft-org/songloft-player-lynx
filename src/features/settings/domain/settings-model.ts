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

/**
 * i18n **key** for a play mode's label (Settings → Playback default-mode
 * selector). The page localises it via `t(...)`; keeping it a pure mode→key map
 * leaves this unit-testable without pulling in i18next.
 */
export function playModeLabelKey(mode: PlayMode): string {
  switch (mode) {
    case playMode.order:
      return 'settings.playModeOrderLabel'
    case playMode.loop:
      return 'settings.playModeLoopLabel'
    case playMode.single:
      return 'settings.playModeSingleLabel'
    case playMode.random:
      return 'settings.playModeRandomLabel'
    default:
      return 'settings.playModeOrderLabel'
  }
}

/** i18n key for a play mode option's short description row. */
export function playModeDescriptionKey(mode: PlayMode): string {
  switch (mode) {
    case playMode.order:
      return 'settings.playModeOrderDesc'
    case playMode.loop:
      return 'settings.playModeLoopDesc'
    case playMode.single:
      return 'settings.playModeSingleDesc'
    case playMode.random:
      return 'settings.playModeRandomDesc'
    default:
      return 'settings.playModeOrderDesc'
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

/** Localised labels for the non-URL states of {@link serverDisplay}. */
export interface ServerDisplayLabels {
  /** Shown for embedded builds (same-origin backend, address hidden). */
  embedded: string
  /** Shown when no server URL is configured. */
  notConfigured: string
}

/**
 * Label describing the current server connection, for the About/Connection
 * rows. Embedded builds hide the address entirely (same-origin backend). The
 * caller supplies already-localised `labels` so this stays pure/testable and
 * free of i18next.
 */
export function serverDisplay(
  baseUrl: string,
  isEmbedded: boolean,
  labels: ServerDisplayLabels,
): string {
  if (isEmbedded) return labels.embedded
  const trimmed = baseUrl.trim()
  return trimmed.length > 0 ? trimmed : labels.notConfigured
}
