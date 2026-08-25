import type { Song } from '../../../models/song.js'
import {
  downloadSong,
  getSongCacheSize,
  removeCachedSong,
  SONG_CACHE_LIMIT_ERROR,
} from '../data/song-cache.js'
import { readLocalCacheMaxSize } from '../data/song-cache-prefs.js'
import { songCacheExtOf, songUrl } from '../store/player-store.js'

/**
 * The "cache this song on the device" flow, split from the UI so it is testable.
 *
 * The component layer owns the affordances it cannot provide here — the video
 * confirm dialog and the translated toasts — and calls these functions, mapping the
 * returned outcome onto its UI. Keeping the decision logic (cap pre-check, download,
 * limit detection) in one place is what lets the player menu and any future entry
 * point share it.
 */

/** How a cache attempt ended. The caller maps this to a toast. */
export type SongCacheOutcome = 'cached' | 'limit' | 'failed'

/**
 * Download `song` into the device cache, honouring the storage cap.
 *
 * Two layers enforce the cap: a cheap pre-check against the *current* cache size
 * (rejects without calling native when already at/over the cap), and the native
 * download itself, which counts incoming bytes and reports `limit_exceeded` if this
 * one file would push past it. The pre-check alone cannot see a single oversized
 * file, so both are needed.
 */
export async function cacheSongToDevice(song: Song): Promise<SongCacheOutcome> {
  const maxSize = await readLocalCacheMaxSize()
  try {
    const currentSize = await getSongCacheSize()
    if (currentSize >= maxSize) return 'limit'
    await downloadSong(song.id, songUrl(song), songCacheExtOf(song), maxSize)
    return 'cached'
  } catch (e) {
    return e instanceof Error && e.message === SONG_CACHE_LIMIT_ERROR ? 'limit' : 'failed'
  }
}

/** Remove `song` from the device cache. */
export async function removeSongCache(song: Song): Promise<'removed' | 'failed'> {
  try {
    await removeCachedSong(song.id)
    return 'removed'
  } catch {
    return 'failed'
  }
}
