import type { Song } from '../../../models/song.js'
import {
  downloadSong,
  getSongCacheSize,
  removeCachedSong,
  SONG_CACHE_LIMIT_ERROR,
} from '../data/song-cache.js'
import { readLocalCacheMaxSize } from '../data/song-cache-prefs.js'
import { currentCacheVariant, songCacheExtOf, songUrl, usePlayerStore } from '../store/player-store.js'
import { cacheIndexedSong, createCacheTaskId, indexedSongCacheAvailable } from '../data/indexed-song-cache.js'
import { captureCacheContext, currentCacheNamespace, removeCurrentIndexedSong, trackCacheDownload } from '../data/cache-context.js'
import { freezeCacheDownload } from './cache-identity.js'
import { getPlatformTarget } from '../../../native/platform-target.js'
import { getSongsApi } from '../../library/api/index.js'

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
  if (indexedSongCacheAvailable()) return cacheIndexedSongToDevice(song)
  const player = usePlayerStore.getState()
  if (player.currentSong?.id === song.id && (player.audioTrack != null || player.isAudioTrackSwitching)) return 'failed'
  const url = songUrl(song)
  const ext = songCacheExtOf(song)
  const maxSize = await readLocalCacheMaxSize()
  try {
    const currentSize = await getSongCacheSize()
    if (currentSize >= maxSize) return 'limit'
    await downloadSong(song.id, url, ext, maxSize)
    return 'cached'
  } catch (e) {
    return e instanceof Error && e.message === SONG_CACHE_LIMIT_ERROR ? 'limit' : 'failed'
  }
}

async function cacheIndexedSongToDevice(source: Song): Promise<SongCacheOutcome> {
  try {
    if (usePlayerStore.getState().currentSong?.id === source.id && usePlayerStore.getState().isAudioTrackSwitching) return 'failed'
    const song = { ...source }
    const captured = captureCacheContext()
    const variant = currentCacheVariant(song)
    const platform = getPlatformTarget()
    const taskId = createCacheTaskId()
    const maxBytes = await readLocalCacheMaxSize()
    const tracks = variant.track !== null ? await getSongsApi().getTracks(song.id) : undefined
    if (currentCacheNamespace() !== captured.namespace) throw new Error('cancelled')
    const request = freezeCacheDownload({ scope: captured.scope, context: captured.context, song, variant, platform, tracks, taskId, maxBytes })
    const detach = trackCacheDownload(taskId, captured.namespace)
    try { await cacheIndexedSong(request) } finally { detach() }
    return 'cached'
  } catch (error) { return error instanceof Error && error.message === SONG_CACHE_LIMIT_ERROR ? 'limit' : 'failed' }
}

/** Remove `song` from the device cache. */
export async function removeSongCache(song: Song): Promise<'removed' | 'failed'> {
  try {
    if (indexedSongCacheAvailable()) await removeCurrentIndexedSong(song, currentCacheVariant(song))
    else await removeCachedSong(song.id)
    return 'removed'
  } catch {
    return 'failed'
  }
}
