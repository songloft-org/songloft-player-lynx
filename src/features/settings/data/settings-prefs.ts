/**
 * Settings persistence + config-mutation helpers (the settings feature's `data`
 * layer). Preferences live in `SongloftStorage.prefs` (batch-2 facade; on device
 * currently an in-memory fallback that is lost on restart — acceptable per
 * PROGRESS). All reads/writes are best-effort: the native prefs stub rejects
 * until the JSB binding lands, so every access is wrapped and swallows errors
 * (mirrors the auth store's `tryPref`/`tryReadPref`).
 */
import { appConfig } from '../../../core/config/app-config.js'
import type { PlayMode } from '../../../core/config/constants.js'
import { getSongloftStorage } from '../../../core/storage/index.js'
import type { SongloftStorage } from '../../../core/storage/types.js'
import {
  normalizeServerUrl,
  PREF_INSECURE_TLS,
  PREF_SERVER_URL,
} from '../../auth/store/index.js'
import { coercePlayMode } from '../domain/settings-model.js'

/** prefs key for the default (preferred) play mode. */
export const PREF_DEFAULT_PLAY_MODE = 'default_play_mode'

/** prefs key for audio streaming quality (bitrate). */
export const PREF_AUDIO_QUALITY = 'audio_quality'

async function tryReadPref(
  storage: SongloftStorage,
  key: string,
): Promise<string | null> {
  try {
    return await storage.prefs.get(key)
  } catch {
    return null
  }
}

async function tryWritePref(
  storage: SongloftStorage,
  key: string,
  value: string,
): Promise<void> {
  try {
    await storage.prefs.set(key, value)
  } catch {
    // ignore — persistence is best-effort; in-memory config still updates.
  }
}

/** Read the persisted default play mode (coerced; defaults to `order`). */
export async function readDefaultPlayMode(
  storage: SongloftStorage = getSongloftStorage(),
): Promise<PlayMode> {
  return coercePlayMode(await tryReadPref(storage, PREF_DEFAULT_PLAY_MODE))
}

/** Persist the default play mode (best-effort). */
export async function writeDefaultPlayMode(
  mode: PlayMode,
  storage: SongloftStorage = getSongloftStorage(),
): Promise<void> {
  await tryWritePref(storage, PREF_DEFAULT_PLAY_MODE, mode)
}

export interface ServerSettings {
  /** Server base URL as entered by the user (will be normalized). */
  url: string
  /** Skip TLS cert validation (persisted; transport no-op today — see AppConfig). */
  insecureTls: boolean
}

/**
 * Apply + persist the server connection settings. Mirrors the batch-3 login
 * flow's config side effects so a switch here is immediately effective for
 * subsequent requests (the auth'd `HttpClient` reads `appConfig.resolvedBaseUrl`
 * live, per request). Returns the normalized URL that was applied.
 *
 * Note: does NOT touch the reactive session store — the caller does that (UI
 * concern), keeping this helper free of Zustand so it stays unit-testable with
 * an injected memory storage.
 */
export async function applyServerSettings(
  { url, insecureTls }: ServerSettings,
  storage: SongloftStorage = getSongloftStorage(),
): Promise<string> {
  const normalized = normalizeServerUrl(url)
  appConfig.baseUrl = normalized
  appConfig.resolvedBaseUrl = normalized
  appConfig.insecureTls = insecureTls
  await tryWritePref(storage, PREF_SERVER_URL, normalized)
  await tryWritePref(storage, PREF_INSECURE_TLS, String(insecureTls))
  return normalized
}

// ─── Audio quality ───────────────────────────────────────────────────────────

export type AudioQuality = 'original' | '320' | '192' | '128'

const VALID_QUALITIES = new Set<string>(['original', '320', '192', '128'])

export function coerceAudioQuality(raw: unknown): AudioQuality {
  return typeof raw === 'string' && VALID_QUALITIES.has(raw) ? (raw as AudioQuality) : 'original'
}

export async function readAudioQuality(
  storage: SongloftStorage = getSongloftStorage(),
): Promise<AudioQuality> {
  return coerceAudioQuality(await tryReadPref(storage, PREF_AUDIO_QUALITY))
}

export async function writeAudioQuality(
  quality: AudioQuality,
  storage: SongloftStorage = getSongloftStorage(),
): Promise<void> {
  await tryWritePref(storage, PREF_AUDIO_QUALITY, quality)
}
