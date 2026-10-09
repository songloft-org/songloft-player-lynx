import { readLynxGlobal, readNativeModules } from '../../../native/native-modules.js'

type Callback = (json: string) => void
/** Optional Android extension. Other hosts and older APKs keep the v2 ABI. */
interface CacheDirectoryModule {
  getStorageContract(callback: Callback): void
  storageCommand(request: string, callback: Callback): void
  cancelTask(taskId: string): void
}
export interface CacheDirectory { tree: string | null; label: string | null; available: boolean; busy: boolean }
export interface MigrationProgress { task_id: string; namespace: string; done: number; total: number }
const contracts = new WeakMap<CacheDirectoryModule, Promise<boolean>>()
function module(): CacheDirectoryModule | null {
  const value = readNativeModules()?.SongloftSongCache as Record<string, unknown> | undefined
  return value && ['getStorageContract', 'storageCommand', 'cancelTask'].every(name => typeof value[name] === 'function')
    ? value as unknown as CacheDirectoryModule : null
}
function invoke(run: (callback: Callback) => void, timeout = 15_000, cancel?: () => void): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      try { cancel?.() } catch { /* Host detached. */ }
      reject(new Error('cache_timeout'))
    }, timeout)
    const finish = (error: unknown, result?: Record<string, unknown>) => {
      if (settled) return
      settled = true; clearTimeout(timer)
      if (error) reject(error)
      else resolve(result!)
    }
    try { run(json => {
      try {
        const value = JSON.parse(json)
        if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid_cache_response')
        finish(typeof value.error === 'string' ? new Error(value.error) : null, value)
      } catch (error) { finish(error) }
    }) } catch (error) { finish(error) }
  })
}
export async function cacheDirectorySupported(): Promise<boolean> {
  const value = module()
  if (!value) return false
  let contract = contracts.get(value)
  if (!contract) {
    contract = invoke(callback => value.getStorageContract(callback)).then(result => result.version === 1)
      .catch(error => { contracts.delete(value); throw error })
    contracts.set(value, contract)
  }
  return contract
}
/** Explicit opt-in keeps older bundles on private media, even on a newer shell. */
export async function storageAwareRequest<T extends object>(request: T): Promise<T & { storage_version?: number }> {
  return await cacheDirectorySupported() ? { ...request, storage_version: 1 } : request
}
async function command(request: object, timeout?: number, cancel?: () => void): Promise<Record<string, unknown>> {
  const value = module()
  if (!value || !await cacheDirectorySupported()) throw new Error('cache_update_required')
  return invoke(callback => value.storageCommand(JSON.stringify(request), callback), timeout, cancel)
}
export async function readCacheDirectory(): Promise<CacheDirectory> {
  const raw = await command({ command: 'getDirectory' })
  if ((raw.tree !== null && typeof raw.tree !== 'string') || (raw.label !== null && typeof raw.label !== 'string') ||
    typeof raw.available !== 'boolean' || typeof raw.busy !== 'boolean') throw new Error('invalid_cache_response')
  return raw as unknown as CacheDirectory
}
export async function chooseCacheDirectory(): Promise<boolean> {
  const result = await command({ command: 'pickDirectory' }, 10 * 60_000)
  if (result.cancelled === true) return false
  if (result.saved !== true) throw new Error('invalid_cache_response')
  return true
}
export async function restoreCacheDirectory(): Promise<void> {
  const result = await command({ command: 'setDirectory', tree: null, label: null })
  if (result.saved !== true) throw new Error('invalid_cache_response')
}
export async function migrateCacheDirectory(request: { task_id: string; namespace: string }): Promise<void> {
  const result = await command({ command: 'migrate', ...request }, 20 * 60_000, () => cancelCacheMigration(request.task_id))
  if (!Number.isSafeInteger(result.done) || (result.done as number) < 0 || result.done !== result.total) throw new Error('invalid_cache_response')
}
export function cancelCacheMigration(taskId: string): void {
  try { module()?.cancelTask(taskId) } catch { /* Disposal must finish even if the native view is already detached. */ }
}
export function subscribeCacheMigration(taskId: string, listener: (value: MigrationProgress) => void): () => void {
  const emitter = readLynxGlobal()?.getJSModule?.('GlobalEventEmitter')
  if (!emitter || typeof emitter.addListener !== 'function' || typeof emitter.removeListener !== 'function') return () => {}
  let active = true
  const handler = (raw: unknown) => {
    if (!active) return
    try {
      const value = typeof raw === 'string' ? JSON.parse(raw) : raw
      if (value?.task_id === taskId && typeof value.namespace === 'string' && Number.isSafeInteger(value.done) &&
        Number.isSafeInteger(value.total) && value.done >= 0 && value.total >= value.done) listener(value)
    } catch { /* Ignore unrelated or malformed events. */ }
  }
  emitter.addListener('songCacheMigrationProgress', handler)
  return () => { active = false; try { emitter.removeListener('songCacheMigrationProgress', handler) } catch { /* Detached host. */ } }
}
