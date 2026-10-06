import { getSongloftStorage } from '../../../core/storage/index.js'
import { getCachedAccessToken } from '../../../core/network/token-cache.js'
import type { Song } from '../../../models/song.js'
import type { AudioTrackInfo } from '../../../models/audio-track.js'
import { getPlatformTarget } from '../../../native/platform-target.js'
import { subscribeAppResumed } from '../../../native/app-lifecycle.js'
import { useAppSessionStore } from '../../../store/app-session.js'
import { getSongsApi } from '../../library/api/index.js'
import { getPlaylistApi } from '../../playlist/api/index.js'
import { useServerStore } from '../../settings/store/server-store.js'
import { CacheBatchController, cacheBatchError, parseCacheBatch, type CacheBatchItem } from '../domain/cache-batch.js'
import { cacheIdentity, cacheSnapshot, freezeCacheDownload, type CacheDownload, type CacheVariant } from '../domain/cache-identity.js'
import { collectCachePlaylist } from '../domain/cache-pagination.js'
import { currentCacheVariant, usePlayerStore } from '../store/player-store.js'
import { captureCacheContext, currentCacheNamespace, trackCacheDownload } from './cache-context.js'
import { cacheIndexedSong, cancelCacheTask, createCacheTaskId, indexedSongCacheAvailable, readCacheTasks, readIndexedSong, requireIndexedSongCache, subscribeCacheTask } from './indexed-song-cache.js'
import { readLocalCacheMaxSize } from './song-cache-prefs.js'

const historyKey = (namespace: string) => `device_cache_batch_v1:${namespace}`
export function captureCacheBatch() {
  const player = usePlayerStore.getState()
  if (player.isAudioTrackSwitching) throw new Error('cache_busy')
  return { ...captureCacheContext(), platform: getPlatformTarget(),
    variant: currentCacheVariant({ id: -1 }), selectedSongId: player.currentSong?.id,
    selectedTrack: player.audioTrack ?? null }
}
export type CacheBatchCapture = ReturnType<typeof captureCacheBatch>

export async function prepareCacheBatch(songs: readonly Song[], captured: CacheBatchCapture) {
  await requireIndexedSongCache()
  const frozen = songs.filter(song => song.type !== 'radio' && !song.isLive).map(song => ({ ...song }))
  if (frozen.length > 10000) throw new Error('cache_queue_full')
  const maxBytes = await readLocalCacheMaxSize()
  const requests: CacheDownload[] = []
  const failed: CacheBatchItem[] = []
  let tracks: AudioTrackInfo[] | undefined
  let trackError: unknown
  if (captured.selectedTrack !== null && frozen.some(song => song.id === captured.selectedSongId)) {
    try { tracks = await getSongsApi().getTracks(captured.selectedSongId!) }
    catch (error) { trackError = error }
  }
  if (currentCacheNamespace() !== captured.namespace) throw new Error('cancelled')
  const context = { ...captured.context, accessToken: getCachedAccessToken() ?? '' }
  for (const song of frozen) {
    if (currentCacheNamespace() !== captured.namespace) throw new Error('cancelled')
    const variant = { ...captured.variant, track: song.id === captured.selectedSongId ? captured.selectedTrack : null }
    const taskId = createCacheTaskId()
    try {
      if (variant.track !== null && trackError) throw trackError
      // Metadata requests may refresh authentication. Freeze the resulting token only after those awaits.
      requests.push(freezeCacheDownload({ ...captured, context,
        song, variant, tracks, taskId, maxBytes }))
    } catch (error) {
      if (currentCacheNamespace() !== captured.namespace) throw new Error('cancelled')
      failed.push({ taskId, ...cacheIdentity({ namespace: captured.namespace, song, variant, format: 'mp3' }),
        snapshot: cacheSnapshot(song), status: 'failed', bytes: 0, total: 0,
        error: variant.track !== null ? 'track_metadata_unavailable' : cacheBatchError(error), skipped: false, cancelling: false })
    }
  }
  return { requests, failed }
}
export async function collectPlaylistForCache(id: number, captured: CacheBatchCapture): Promise<Song[]> {
  const api = getPlaylistApi()
  // Cache the whole playlist independently of its visible search filter or loaded pages.
  return collectCachePlaylist({ valid: () => currentCacheNamespace() === captured.namespace,
    fetch: (offset, limit) => api.getPlaylistSongs(id, { sort: 'position', order: 'asc' }, { offset, limit }) })
}
async function rebuild(item: CacheBatchItem, namespace: string) {
  const captured = captureCacheBatch()
  if (captured.namespace !== namespace) throw new Error('cancelled')
  const parts = JSON.parse(item.key) as string[]
  const variant: CacheVariant = { track: parts[2] === 'default' ? null : Number(parts[2]),
    quality: parts[3] as CacheVariant['quality'], normalize: parts[4] === '1' }
  const song = await getSongsApi().getSong(item.snapshot.id)
  const maxBytes = await readLocalCacheMaxSize()
  const tracks = variant.track !== null ? await getSongsApi().getTracks(song.id) : undefined
  if (currentCacheNamespace() !== namespace) throw new Error('cancelled')
  return freezeCacheDownload({ ...captured, context: { ...captured.context, accessToken: getCachedAccessToken() ?? '' },
    song, variant, tracks, maxBytes, taskId: createCacheTaskId() })
}

export const cacheBatchController = new CacheBatchController({
  cached: request => readIndexedSong({ namespace: request.namespace, key: request.key }),
  download: async (request, progress) => {
    const detach = trackCacheDownload(request.task_id, request.namespace)
    const unsubscribe = subscribeCacheTask(request.task_id, progress)
    try { return await cacheIndexedSong(request) } finally { unsubscribe(); detach() }
  },
  cancel: cancelCacheTask,
  read: async namespace => parseCacheBatch(await getSongloftStorage().prefs.get(historyKey(namespace)), namespace),
  save: (namespace, items) => getSongloftStorage().prefs.set(historyKey(namespace), JSON.stringify({ version: 1, namespace, items })),
  rebuild,
})
let initialized = false
export function initializeCacheBatch(): void {
  if (initialized || !indexedSongCacheAvailable()) return
  initialized = true
  const sync = () => { void cacheBatchController.setNamespace(currentCacheNamespace()) }
  useAppSessionStore.subscribe(sync)
  useServerStore.subscribe(sync)
  sync()
  // Core history restores interrupted work; in-flight progress refreshes after a foreground suspension.
  subscribeAppResumed(() => {
    sync()
    void readCacheTasks().then(tasks => cacheBatchController.refreshProgress(tasks)).catch(() => {})
  })
}
