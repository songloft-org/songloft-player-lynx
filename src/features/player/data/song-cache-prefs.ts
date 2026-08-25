import { getSongloftStorage } from '../../../core/storage/index.js'
import type { SongloftStorage } from '../../../core/storage/types.js'

/**
 * Persistence for the on-device song-cache size cap. Same best-effort pattern as
 * `features/settings/data/settings-prefs.ts`: native storage on device, in-memory
 * fallback elsewhere.
 *
 * The cap guards the *device* cache (the native `SongloftSongCache` module), not the
 * server-side cache. Default is 1 GiB, matching the Flutter build's
 * `local_cache_max_size` default.
 */

/** prefs key for the device song-cache cap in bytes. */
export const PREF_LOCAL_CACHE_MAX_SIZE = 'local_cache_max_size'

/** 1 GiB, the Flutter build's default. */
export const DEFAULT_LOCAL_CACHE_MAX_SIZE = 1073741824

function coerceMaxSize(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : DEFAULT_LOCAL_CACHE_MAX_SIZE
}

export async function readLocalCacheMaxSize(
  storage: SongloftStorage = getSongloftStorage(),
): Promise<number> {
  try {
    return coerceMaxSize(await storage.prefs.get(PREF_LOCAL_CACHE_MAX_SIZE))
  } catch {
    return DEFAULT_LOCAL_CACHE_MAX_SIZE
  }
}

export async function writeLocalCacheMaxSize(
  bytes: number,
  storage: SongloftStorage = getSongloftStorage(),
): Promise<void> {
  try {
    // prefs stores strings; `coerceMaxSize` parses it back on read.
    await storage.prefs.set(PREF_LOCAL_CACHE_MAX_SIZE, String(bytes))
  } catch {
    // best-effort
  }
}
