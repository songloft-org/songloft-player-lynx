import { getSongloftStorage } from '../../../core/storage/index.js'
import type { SongloftStorage } from '../../../core/storage/types.js'

export type PlaylistViewMode = 'grid' | 'list'

const PREF_KEY = 'playlist_view_mode'

export async function readPlaylistViewMode(
  storage: SongloftStorage = getSongloftStorage(),
): Promise<PlaylistViewMode> {
  try {
    const raw = await storage.prefs.get(PREF_KEY)
    if (raw === 'list') return 'list'
    return 'grid'
  } catch {
    return 'grid'
  }
}

export async function writePlaylistViewMode(
  mode: PlaylistViewMode,
  storage: SongloftStorage = getSongloftStorage(),
): Promise<void> {
  try {
    await storage.prefs.set(PREF_KEY, mode)
  } catch {
    // best-effort
  }
}
