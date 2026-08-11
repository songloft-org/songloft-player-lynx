/**
 * Settings domain — pure, framework-free helpers shared by the settings pages
 * and unit tests. No Lynx runtime globals, no stores, no I/O.
 *
 * This batch ports only the *self-contained* slice of the Flutter settings
 * surface (about/version, log out, server-address switch). The rest of the Flutter
 * settings categories depend on capabilities not yet built (scan/cache/upgrade
 * ops, plugin registry, downloads, licenses, i18n) and are deferred — see PROGRESS.
 *
 * The play-mode label/icon/option helpers that used to live here went away with
 * the Settings → Playback section (the player's own mode toggle carries its own
 * `MODE_ICON`/`MODE_LABEL_KEY` maps under `player.mode*` keys). Only
 * {@link coercePlayMode} remains, because the pref still round-trips.
 */
import { playMode, playModes, type PlayMode } from '../../../core/config/constants.js'

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
