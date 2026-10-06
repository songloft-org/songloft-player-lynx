import { readLynxGlobal, readNativeModules } from '../../native/native-modules.js'
import { parseReleaseManifest, type BuildIdentity, type NativeHostInfo, type ReleaseManifest } from './update-contract.js'

type Callback = (json: string) => void
interface UpdateModule {
  fetchMetadata?(request: string, callback: Callback): void
  getInfo(callback: Callback): void
  getState(callback: Callback): void
  inspectManifest(raw: string, signature: string, callback: Callback): void
  download(request: string, callback: Callback): void
  cancel(taskId: string): void
  confirmStartup(bundleId: string): void
  reportStartupFailure(): void
  restoreBuiltin(callback: Callback): void
}
export interface UpdateProgress { task_id: string; bytes: number; total: number }
export interface UpdateState {
  host: NativeHostInfo
  running: BuildIdentity & { kind: 'builtin' | 'trial' | 'active'; bundle_update?: ReleaseManifest['bundle_update'] }
  active: ReleaseManifest | null
  previous: ReleaseManifest | null
  pending: ReleaseManifest | null
  last_error?: string
  download?: UpdateProgress
}
const methods = ['getInfo', 'getState', 'inspectManifest', 'download', 'cancel', 'confirmStartup', 'reportStartupFailure', 'restoreBuiltin'] as const
function module(): UpdateModule | null {
  const value = readNativeModules()?.SongloftUpdate as Record<string, unknown> | undefined
  return value && methods.every(name => typeof value[name] === 'function') ? value as unknown as UpdateModule : null
}
export function nativeUpdaterAvailable(): boolean { return module() !== null }
export function nativeUpdateMetadataAvailable(): boolean { return typeof module()?.fetchMetadata === 'function' }
export async function fetchNativeUpdateMetadata(url: string, maxBytes: number): Promise<{ status: number; body: string }> {
  const value = requiredModule()
  if (typeof value.fetchMetadata !== 'function') throw new Error('metadata_unavailable')
  const raw = record(await invoke(callback => value.fetchMetadata!(JSON.stringify({ url, max_bytes: maxBytes }), callback)))
  if (typeof raw.status !== 'number' || !Number.isInteger(raw.status) || raw.status < 100 || raw.status > 599 ||
    typeof raw.body !== 'string' || raw.body.length > maxBytes) throw new Error('invalid_update_response')
  return { status: raw.status, body: raw.body }
}
function requiredModule(): UpdateModule { const value = module(); if (!value) throw new Error('update_unavailable'); return value }

function invoke(run: (callback: Callback) => void, timeout = 15_000, onTimeout?: () => void): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      try { onTimeout?.() } catch { /* The callback can no longer settle this promise. */ }
      reject(new Error('update_timeout'))
    }, timeout)
    const finish = (error: unknown, result?: unknown) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (error) reject(error instanceof Error ? error : new Error('update_failed'))
      else resolve(result)
    }
    try {
      run(json => {
        if (settled) return
        try {
          const value = JSON.parse(json)
          if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid_update_response')
          finish(value.error ? new Error(typeof value.error === 'string' ? value.error : 'update_failed') : null, value)
        } catch (error) { finish(error) }
      })
    } catch (error) { finish(error) }
  })
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid_update_response')
  return value as Record<string, unknown>
}
function list(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > 64 || value.some(item => typeof item !== 'string' || item.length > 1024) || new Set(value).size !== value.length)
    throw new Error('invalid_update_response')
  return value
}
function integer(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw new Error('invalid_update_response')
  return value
}
function identity(value: Record<string, unknown>): BuildIdentity {
  return parseReleaseManifest({ ...value, assets: [], bundle_update: null })
}
function host(value: unknown): NativeHostInfo {
  const raw = record(value)
  if (!['android', 'ios', 'harmony'].includes(String(raw.platform)) || typeof raw.engine !== 'string' ||
    !/^\d+\.\d+\.\d+$/.test(raw.engine)) throw new Error('invalid_update_response')
  return { ...identity(raw), platform: raw.platform as NativeHostInfo['platform'], engine: raw.engine,
    update_protocol: integer(raw.update_protocol), bridge_version: integer(raw.bridge_version),
    local_schema: integer(raw.local_schema), capabilities: list(raw.capabilities), trusted_key_ids: list(raw.trusted_key_ids) }
}
function progress(value: unknown): UpdateProgress {
  const raw = record(value)
  if (typeof raw.task_id !== 'string' || !/^[A-Za-z0-9-]{1,96}$/.test(raw.task_id)) throw new Error('invalid_update_response')
  const bytes = integer(raw.bytes), total = integer(raw.total)
  if (bytes > total || total > 32 * 1024 * 1024) throw new Error('invalid_update_response')
  return { task_id: raw.task_id, bytes, total }
}
export async function getUpdateHost(): Promise<NativeHostInfo> {
  const value = requiredModule()
  return host(await invoke(callback => value.getInfo(callback)))
}
export async function getUpdateState(): Promise<UpdateState> {
  const value = requiredModule()
  const raw = record(await invoke(callback => value.getState(callback)))
  const running = record(raw.running)
  if (!['builtin', 'trial', 'active'].includes(String(running.kind))) throw new Error('invalid_update_response')
  const manifest = running.kind === 'builtin' ? identity(running) : parseReleaseManifest(running)
  const candidate = (value: unknown) => value == null ? null : parseReleaseManifest(value)
  return { host: host(raw.host), running: { ...manifest, kind: running.kind as UpdateState['running']['kind'] },
    active: candidate(raw.active), previous: candidate(raw.previous), pending: candidate(raw.pending),
    ...(typeof raw.last_error === 'string' ? { last_error: raw.last_error.slice(0, 128) } : {}),
    ...(raw.download != null ? { download: progress(raw.download) } : {}) }
}
/** Native signature verification is authoritative; JS does not approve a bundle. */
export async function inspectUpdateManifest(raw: string, signature: string): Promise<ReleaseManifest> {
  const value = requiredModule()
  return parseReleaseManifest(await invoke(callback => value.inspectManifest(raw, signature, callback)))
}
let sequence = 0
export function createUpdateTaskId(): string { return `update-${Date.now()}-${++sequence}` }
export async function prepareBundleUpdate(input: { task_id: string; manifest: string; signature: string; url: string }): Promise<string> {
  const value = requiredModule()
  const taskId = input.task_id
  const request = JSON.stringify(input) // Freeze before crossing the async bridge.
  const result = record(await invoke(callback => value.download(request, callback), 240_000, () => value.cancel(taskId)))
  if (result.prepared !== true || typeof result.bundle_id !== 'string' || !/^[A-Za-z0-9._-]{1,96}$/.test(result.bundle_id))
    throw new Error('invalid_update_response')
  return result.bundle_id
}
export function cancelBundleUpdate(taskId: string): void { requiredModule().cancel(taskId) }
export async function restoreBuiltinBundle(): Promise<void> {
  const value = requiredModule()
  await invoke(callback => value.restoreBuiltin(callback))
}
export function reportUpdateStartupFailure(): void { try { module()?.reportStartupFailure() } catch { /* Cold-start trial remains unconfirmed. */ } }
export async function confirmUpdateStartup(): Promise<void> {
  if (!nativeUpdaterAvailable()) return
  try {
    const state = await getUpdateState()
    if (state.running.kind === 'trial' && state.running.bundle_update) requiredModule().confirmStartup(state.running.bundle_update.bundle_id)
  } catch { /* Failure preserves the native unconfirmed trial and its rollback. */ }
}
export function subscribeUpdateProgress(taskId: string, listener: (value: UpdateProgress) => void): () => void {
  const emitter = readLynxGlobal()?.getJSModule?.('GlobalEventEmitter')
  if (typeof emitter?.addListener !== 'function' || typeof emitter?.removeListener !== 'function') return () => {}
  let active = true
  const handler = (raw: unknown) => {
    if (!active) return
    try { const value = progress(typeof raw === 'string' ? JSON.parse(raw) : raw); if (value.task_id === taskId) listener(value) } catch { /* Ignore malformed/late events. */ }
  }
  emitter.addListener('SongloftUpdate.progress', handler)
  return () => { if (active) { active = false; try { emitter.removeListener('SongloftUpdate.progress', handler) } catch { /* Detached host. */ } } }
}
