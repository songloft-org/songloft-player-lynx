import { getSongloftStorage } from '../../../core/storage/index.js'
import type { SongloftStorage } from '../../../core/storage/types.js'

export interface CachedLyric {
  lyric?: string
  tlyric?: string
  rlyric?: string
  lxlyric?: string
  cachedAt: number
  /**
   * The song's `updatedAt` timestamp at the moment the payload was cached.
   * `loadForSong` invalidates the cache when the current `song.updatedAt`
   * no longer matches, so server-side lyric edits (e.g. embedded USLT rewrites)
   * take effect without waiting for a manual cache clear. See songloft-org/songloft#477.
   * Older entries written before this field existed will lack it and are
   * treated as stale on first read.
   */
  songUpdatedAt?: string
}

function cacheKey(songId: number): string {
  return `lyric_${songId}`
}

export async function getCachedLyric(
  songId: number,
  storage?: SongloftStorage,
): Promise<CachedLyric | null> {
  try {
    const s = storage ?? getSongloftStorage()
    const raw = await s.prefs.get(cacheKey(songId))
    if (raw == null) return null
    return JSON.parse(raw) as CachedLyric
  } catch {
    return null
  }
}

export async function cacheLyric(
  songId: number,
  data: CachedLyric,
  storage?: SongloftStorage,
): Promise<void> {
  try {
    const s = storage ?? getSongloftStorage()
    await s.prefs.set(cacheKey(songId), JSON.stringify(data))
  } catch {
    // best-effort
  }
}

/**
 * Drop the cached payload so the next `loadForSong` goes back to the backend —
 * used both after saving adjusted lyrics and before a forced re-fetch. Best-
 * effort like the other cache ops: a failed eviction only means a stale read.
 */
export async function removeCachedLyric(
  songId: number,
  storage?: SongloftStorage,
): Promise<void> {
  try {
    const s = storage ?? getSongloftStorage()
    await s.prefs.remove(cacheKey(songId))
  } catch {
    // best-effort
  }
}
