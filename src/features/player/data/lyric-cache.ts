import { getSongloftStorage } from '../../../core/storage/index.js'
import type { SongloftStorage } from '../../../core/storage/types.js'

export interface CachedLyric {
  lyric?: string
  tlyric?: string
  rlyric?: string
  lxlyric?: string
  cachedAt: number
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
