import { appConfig } from '../../../core/config/app-config.js'
import { defaultUrlContext } from '../../../core/network/url-helper.js'
import { useAppSessionStore } from '../../../store/app-session.js'
import { useServerStore } from '../../settings/store/server-store.js'
import type { Song } from '../../../models/song.js'
import type { CacheVariant } from '../domain/cache-identity.js'
import { cacheIdentity, cacheNamespace, type CacheScope } from '../domain/cache-identity.js'
import { cancelCacheTask, indexedSongCacheAvailable, readCacheTasks, readIndexedSong, removeIndexedSong } from './indexed-song-cache.js'

export function currentCacheScope(): CacheScope | null {
  const session = useAppSessionStore.getState()
  if (!session.username) return null
  const servers = useServerStore.getState()
  const active = servers.profiles.find(value => value.id === servers.activeProfileId && value.url === appConfig.baseUrl)
  return { profile: active?.id ?? null, server: `${appConfig.baseUrl}${appConfig.basePath}`, username: session.username }
}
export function currentCacheNamespace(): string | null {
  const scope = currentCacheScope()
  try { return scope ? cacheNamespace(scope) : null } catch { return null }
}
export function captureCacheContext() {
  const scope = currentCacheScope()
  if (!scope) throw new Error('cache_identity_unavailable')
  return { scope, namespace: cacheNamespace(scope), context: defaultUrlContext() }
}
export async function getIndexedCachedPath(song: Song, variant: CacheVariant): Promise<string | null> {
  const namespace = currentCacheNamespace()
  if (!namespace) return null
  // Lookup matches the six variant fields; the seventh is the native-observed media container.
  const identity = cacheIdentity({ namespace, song, variant, format: 'mp3' })
  const entry = await readIndexedSong(identity)
  return currentCacheNamespace() === namespace ? entry?.url ?? null : null
}
export async function getIndexedCacheInfo(song: Song, variant: CacheVariant) {
  const namespace = currentCacheNamespace()
  if (!namespace) return { cached: false }
  const entry = await readIndexedSong(cacheIdentity({ namespace, song, variant, format: 'mp3' }))
  return currentCacheNamespace() === namespace && entry ? entry : { cached: false }
}
export async function removeCurrentIndexedSong(song: Song, variant: CacheVariant): Promise<void> {
  const namespace = currentCacheNamespace()
  if (!namespace) throw new Error('cache_identity_unavailable')
  await removeIndexedSong(cacheIdentity({ namespace, song, variant, format: 'mp3' }))
}

const running = new Map<string, string>()
let installed = false
/** Context switches cancel downloads, preserve completed files, and never reassign legacy files. */
export function initializeCacheContext(): void {
  if (installed || !indexedSongCacheAvailable()) return
  installed = true
  let previous = currentCacheNamespace()
  const reconcile = () => {
    const namespace = currentCacheNamespace()
    if (namespace === previous) return
    previous = namespace
    for (const [taskId, owner] of running) if (owner !== namespace) cancelCacheTask(taskId)
    void readCacheTasks().then(tasks => {
      // Recheck current identity after the asynchronous callback.
      const current = currentCacheNamespace()
      for (const task of tasks) if (task.namespace !== current && ['waiting', 'downloading'].includes(task.status)) cancelCacheTask(task.task_id)
    }).catch(() => {})
  }
  useAppSessionStore.subscribe(reconcile)
  useServerStore.subscribe(reconcile)
  // Also clean up native tasks left by a JS remount before this module observed them.
  void readCacheTasks().then(tasks => {
    const namespace = currentCacheNamespace()
    for (const task of tasks) if (task.namespace !== namespace && ['waiting', 'downloading'].includes(task.status)) cancelCacheTask(task.task_id)
  }).catch(() => {})
}
export function trackCacheDownload(taskId: string, namespace: string): () => void {
  initializeCacheContext()
  running.set(taskId, namespace)
  if (currentCacheNamespace() !== namespace) cancelCacheTask(taskId)
  return () => { running.delete(taskId) }
}
