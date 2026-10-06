import { readLynxGlobal, readNativeModules } from '../../../native/native-modules.js'
import type { CacheDownload, CacheIdentity, CacheSnapshot } from '../domain/cache-identity.js'

type Callback = (json: string) => void
interface IndexedSongCacheModule {
  getCacheContract(callback: Callback): void
  cacheEntry(request: string, callback: Callback): void
  getEntry(request: string, callback: Callback): void
  listEntries(request: string, callback: Callback): void
  removeEntry(request: string, callback: Callback): void
  clearNamespace(request: string, callback: Callback): void
  clearLegacy(callback: Callback): void
  getTasks(callback: Callback): void
  cancelTask(taskId: string): void
}
export interface CachedEntry extends CacheIdentity { cached: true; url: string; sizeBytes: number; createdAt: number; snapshot: CacheSnapshot }
export interface CacheTask extends CacheIdentity {
  task_id: string
  status: 'waiting' | 'downloading' | 'completed' | 'failed' | 'cancelled' | 'interrupted'
  bytes: number
  total: number
  error: string | null
}
export interface CachePage { entries: CachedEntry[]; total: number; bytes: number; legacy_bytes: number }
export const SONG_CACHE_PROGRESS_EVENT = 'songCacheProgress'
const methods = ['getCacheContract', 'cacheEntry', 'getEntry', 'listEntries', 'removeEntry', 'clearNamespace', 'clearLegacy', 'getTasks', 'cancelTask'] as const
function module(): IndexedSongCacheModule | null {
  const value = readNativeModules()?.SongloftSongCache as Record<string, unknown> | undefined
  return value && methods.every(name => typeof value[name] === 'function') ? value as unknown as IndexedSongCacheModule : null
}
export function indexedSongCacheAvailable(): boolean { return module() !== null }
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid_cache_response')
  return value as Record<string, unknown>
}
function invoke(run: (callback: Callback) => void, input: { timeout?: number; cancel?: () => void } = {}): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let settled = false
    const timer = setTimeout(() => {
      settled = true
      try { input.cancel?.() } catch { /* Detached host. */ }
      reject(new Error('cache_timeout'))
    }, input.timeout ?? 15_000)
    const finish = (error: unknown, result?: Record<string, unknown>) => {
      if (settled) return
      settled = true; clearTimeout(timer)
      if (error) reject(error)
      else resolve(result!)
    }
    try {
      run(json => {
        if (settled) return
        try { const value = record(JSON.parse(json)); finish(typeof value.error === 'string' ? new Error(value.error) : null, value) }
        catch (error) { finish(error) }
      })
    } catch (error) { finish(error) }
  })
}
const contracts = new WeakMap<IndexedSongCacheModule, Promise<void>>()
async function requireModule(): Promise<IndexedSongCacheModule> {
  const value = module()
  if (!value) throw new Error('cache_update_required')
  let contract = contracts.get(value)
  if (!contract) {
    contract = invoke(callback => value.getCacheContract(callback)).then(result => {
      if (result.version !== 2) throw new Error('cache_update_required')
    }).catch(error => { contracts.delete(value); throw error })
    contracts.set(value, contract)
  }
  await contract
  return value
}
function integer(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw new Error('invalid_cache_response')
  return value
}
function entry(value: unknown): CachedEntry {
  const raw = record(value), snapshot = record(raw.snapshot)
  if (raw.cached !== true || typeof raw.namespace !== 'string' || typeof raw.key !== 'string' ||
    typeof raw.url !== 'string' || !raw.url.startsWith('file://') || typeof snapshot.title !== 'string' ||
    !['local', 'remote'].includes(String(snapshot.type))) throw new Error('invalid_cache_response')
  const identity = JSON.parse(raw.key)
  if (!Array.isArray(identity) || identity.length !== 7 || identity[0] !== raw.namespace || String(snapshot.id) !== identity[1]) throw new Error('invalid_cache_response')
  return { namespace: raw.namespace, key: raw.key, cached: true, url: raw.url,
    sizeBytes: integer(raw.sizeBytes), createdAt: integer(raw.createdAt), snapshot: snapshot as unknown as CacheSnapshot }
}
function task(value: unknown): CacheTask {
  const raw = record(value)
  if (typeof raw.task_id !== 'string' || !/^[A-Za-z0-9_-]{1,96}$/.test(raw.task_id) ||
    typeof raw.namespace !== 'string' || typeof raw.key !== 'string' ||
    !['waiting', 'downloading', 'completed', 'failed', 'cancelled', 'interrupted'].includes(String(raw.status))) throw new Error('invalid_cache_response')
  return { task_id: raw.task_id, namespace: raw.namespace, key: raw.key, status: raw.status as CacheTask['status'],
    bytes: integer(raw.bytes), total: integer(raw.total), error: typeof raw.error === 'string' ? raw.error.slice(0, 128) : null }
}
export function createCacheTaskId(): string { return `cache-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}` }
export async function cacheIndexedSong(request: CacheDownload): Promise<CachedEntry> {
  const value = await requireModule()
  return entry(await invoke(callback => value.cacheEntry(JSON.stringify(request), callback),
    { timeout: 20 * 60_000, cancel: () => value.cancelTask(request.task_id) }))
}
export async function readIndexedSong(request: { namespace: string; key?: string; song_id?: number }): Promise<CachedEntry | null> {
  const value = await requireModule()
  const raw = await invoke(callback => value.getEntry(JSON.stringify(request), callback))
  const result = raw.cached === false ? null : entry(raw)
  if (result && result.namespace !== request.namespace) throw new Error('invalid_cache_response')
  if (result && request.key) {
    const wanted = JSON.parse(request.key), actual = JSON.parse(result.key)
    if (!Array.isArray(wanted) || wanted.slice(0, 6).some((field, index) => field !== actual[index])) throw new Error('invalid_cache_response')
  }
  if (result && request.song_id !== undefined && result.snapshot.id !== request.song_id) throw new Error('invalid_cache_response')
  return result
}
export async function listIndexedSongs(request: { namespace: string; offset?: number; limit?: number }): Promise<CachePage> {
  const value = await requireModule()
  const raw = await invoke(callback => value.listEntries(JSON.stringify(request), callback))
  if (!Array.isArray(raw.entries)) throw new Error('invalid_cache_response')
  const entries = raw.entries.map(entry)
  if (entries.some(value => value.namespace !== request.namespace)) throw new Error('invalid_cache_response')
  return { entries, total: integer(raw.total), bytes: integer(raw.bytes), legacy_bytes: integer(raw.legacy_bytes) }
}
export async function removeIndexedSong(request: { namespace: string; key?: string; song_id?: number }): Promise<void> {
  const value = await requireModule()
  await invoke(callback => value.removeEntry(JSON.stringify(request), callback), { timeout: 20 * 60_000 })
}
export async function clearIndexedNamespace(namespace: string): Promise<void> {
  const value = await requireModule()
  await invoke(callback => value.clearNamespace(JSON.stringify({ namespace }), callback), { timeout: 20 * 60_000 })
}
export async function clearLegacySongs(): Promise<void> {
  const value = await requireModule()
  await invoke(callback => value.clearLegacy(callback), { timeout: 20 * 60_000 })
}
export async function readCacheTasks(): Promise<CacheTask[]> {
  const value = await requireModule()
  const raw = await invoke(callback => value.getTasks(callback))
  if (!Array.isArray(raw.tasks)) throw new Error('invalid_cache_response')
  return raw.tasks.map(task)
}
export function cancelCacheTask(taskId: string): void { module()?.cancelTask(taskId) }
export function subscribeCacheTask(taskId: string, listener: (value: CacheTask) => void): () => void {
  const emitter = readLynxGlobal()?.getJSModule?.('GlobalEventEmitter')
  if (typeof emitter?.addListener !== 'function' || typeof emitter?.removeListener !== 'function') return () => {}
  let active = true
  const handler = (raw: unknown) => {
    if (!active) return
    try { const value = task(typeof raw === 'string' ? JSON.parse(raw) : raw); if (value.task_id === taskId) listener(value) }
    catch { /* Ignore other tasks, malformed events and detached views. */ }
  }
  emitter.addListener(SONG_CACHE_PROGRESS_EVENT, handler)
  return () => { if (active) { active = false; emitter.removeListener(SONG_CACHE_PROGRESS_EVENT, handler) } }
}
