import type { CacheDownload, CacheSnapshot } from './cache-identity.js'
import type { CachedEntry, CacheTask } from '../data/indexed-song-cache.js'

export interface CacheBatchItem {
  taskId: string
  key: string
  snapshot: CacheSnapshot
  status: CacheTask['status']
  bytes: number
  total: number
  error: string | null
  skipped: boolean
  cancelling: boolean
}
export interface CacheBatchState {
  namespace: string | null
  items: CacheBatchItem[]
  running: boolean
  blocked: boolean
}
export interface CacheBatchDeps {
  cached(request: CacheDownload): Promise<CachedEntry | null>
  download(request: CacheDownload, progress: (task: CacheTask) => void): Promise<CachedEntry>
  cancel(taskId: string): void
  read(namespace: string): Promise<CacheBatchItem[]>
  save(namespace: string, items: CacheBatchItem[]): Promise<void>
  rebuild(item: CacheBatchItem, namespace: string): Promise<CacheDownload>
}

const CAPACITY_ERRORS = new Set(['limit_exceeded', 'insufficient_space'])
const MACHINE_ERRORS = new Set(['limit_exceeded', 'insufficient_space', 'cancelled', 'interrupted', 'cache_queue_full',
  'cache_busy', 'cache_storage_unavailable', 'download_failed', 'unsupported_media', 'cache_timeout',
  'cache_update_required', 'invalid_cache_request', 'track_metadata_unavailable', 'batch_capacity_stop'])
export function cacheBatchError(error: unknown): string {
  const code = error instanceof Error ? error.message : ''
  return MACHINE_ERRORS.has(code) ? code : 'download_failed'
}
const active = (item: CacheBatchItem) => item.status === 'waiting' || item.status === 'downloading'
const variantKey = (key: string): string => JSON.stringify((JSON.parse(key) as string[]).slice(0, 6))
const snapshotCopy = (snapshot: CacheSnapshot): CacheSnapshot => ({ id: snapshot.id, type: snapshot.type,
  title: snapshot.title, artist: snapshot.artist, album: snapshot.album, duration: snapshot.duration,
  isVideo: snapshot.isVideo, format: snapshot.format, updatedAt: snapshot.updatedAt })

/** Never trust a typed cast of persisted JSON; return only fields intended for local display. */
export function parseCacheBatch(raw: string | null, namespace: string): CacheBatchItem[] {
  if (!raw || raw.length > 12 * 1024 * 1024) return []
  try {
    const record = JSON.parse(raw)
    if (record.version !== 1 || record.namespace !== namespace || !Array.isArray(record.items) || record.items.length > 10000) return []
    return record.items.map((item: CacheBatchItem) => {
      const parts = JSON.parse(item.key)
      const snapshot = item.snapshot
      if (typeof item.taskId !== 'string' || !/^[A-Za-z0-9_-]{1,96}$/.test(item.taskId) || !Array.isArray(parts) || parts.length !== 7 || parts[0] !== namespace ||
        parts.some((part: unknown) => typeof part !== 'string') || !snapshot || !Number.isSafeInteger(snapshot.id) ||
        !/^(default|[0-9]{1,6})$/.test(parts[2]) || !['original', '320', '192', '128'].includes(parts[3]) ||
        !['0', '1'].includes(parts[4]) || !parts[5] || parts[5].length > 128 || !/^[a-z0-9]{1,12}$/.test(parts[6]) ||
        snapshot.id <= 0 || String(snapshot.id) !== parts[1] || !['local', 'remote'].includes(snapshot.type) ||
        typeof snapshot.title !== 'string' || typeof snapshot.artist !== 'string' || typeof snapshot.album !== 'string' ||
        typeof snapshot.format !== 'string' || typeof snapshot.updatedAt !== 'string' || typeof snapshot.isVideo !== 'boolean' ||
        !Number.isFinite(snapshot.duration) || snapshot.duration < 0 ||
        !['waiting', 'downloading', 'completed', 'failed', 'cancelled', 'interrupted'].includes(item.status) ||
        !Number.isSafeInteger(item.bytes) || item.bytes < 0 || !Number.isSafeInteger(item.total) || item.total < 0) throw new Error('invalid_history')
      return { taskId: item.taskId, key: item.key, snapshot: snapshotCopy(snapshot), status: item.status,
        bytes: item.bytes, total: item.total, error: item.error && MACHINE_ERRORS.has(item.error) ? item.error : null,
        skipped: item.skipped === true, cancelling: false }
    })
  } catch { return [] }
}

/** One JS producer feeds the host's shared serial queue; only whitelisted metadata is persisted. */
export class CacheBatchController {
  private state: CacheBatchState = { namespace: null, items: [], running: false, blocked: false }
  private requests = new Map<string, CacheDownload>()
  private listeners = new Set<() => void>()
  private epoch = 0
  private retryVersion = 0
  private retrying = false
  private writes: Promise<void> = Promise.resolve()
  private pendingSaves = new Map<string, CacheBatchItem[]>()
  private saveTimer: ReturnType<typeof setTimeout> | null = null

  constructor(private readonly deps: CacheBatchDeps) {}
  getState = (): CacheBatchState => this.state
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }
  private update(change: Partial<CacheBatchState>): void {
    this.state = { ...this.state, ...change }
    for (const listener of this.listeners) listener()
  }
  private item(taskId: string, change: Partial<CacheBatchItem>): void {
    this.update({ items: this.state.items.map(item => item.taskId === taskId ? { ...item, ...change } : item) })
  }
  private persist(immediate = false): void {
    const namespace = this.state.namespace
    if (!namespace) return
    // Immutable state makes retaining the newest snapshot safe; avoid queuing large copies per event.
    this.pendingSaves.set(namespace, this.state.items)
    if (immediate) this.flush()
    else if (this.saveTimer === null) this.saveTimer = setTimeout(() => this.flush(), 250)
  }
  private flush(): void {
    if (this.saveTimer !== null) clearTimeout(this.saveTimer)
    this.saveTimer = null
    const pending = this.pendingSaves
    this.pendingSaves = new Map()
    this.writes = this.writes.catch(() => {}).then(async () => {
      for (const [namespace, values] of pending) {
        const items = values.map(item => ({ ...item, snapshot: snapshotCopy(item.snapshot), cancelling: false }))
        try { await this.deps.save(namespace, items) } catch { /* Native committed files stay valid even when history storage fails. */ }
      }
    })
  }
  async setNamespace(namespace: string | null): Promise<void> {
    if (namespace === this.state.namespace) return
    this.cancelRemaining()
    const epoch = ++this.epoch
    this.retrying = false
    this.requests.clear()
    this.update({ namespace, items: [], running: false, blocked: false })
    const empty = this.state
    if (!namespace) return
    let saved: CacheBatchItem[]
    try { saved = await this.deps.read(namespace) } catch { return }
    // A new submission or identity change must win over a late history read.
    if (epoch !== this.epoch || this.state !== empty) return
    const items = saved.map(item => active(item)
      ? { ...item, status: 'interrupted' as const, error: 'interrupted', cancelling: false }
      : { ...item, cancelling: false })
    for (const item of saved) if (item.status === 'downloading') this.safeCancel(item.taskId)
    this.update({ items })
    this.persist(true)
  }
  submit(requests: readonly CacheDownload[], failed: readonly CacheBatchItem[] = []): number {
    const namespace = this.state.namespace
    if (!namespace || requests.some(request => request.namespace !== namespace)) throw new Error('cancelled')
    if (requests.length + failed.length > 10000) throw new Error('cache_queue_full')
    const continuing = this.state.running || this.state.items.some(active)
    if (!continuing) this.requests.clear()
    const items = continuing ? [...this.state.items] : []
    const seen = new Set(items.map(item => variantKey(item.key)))
    const additions: CacheDownload[] = []
    for (const request of requests) {
      const key = variantKey(request.key)
      if (seen.has(key)) continue
      seen.add(key)
      additions.push(request)
    }
    const failures = failed.filter(item => {
      const key = variantKey(item.key)
      if (JSON.parse(item.key)[0] !== namespace) throw new Error('cancelled')
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    if (items.length + additions.length + failures.length > 10000) throw new Error('cache_queue_full')
    for (const request of additions) {
      this.requests.set(request.task_id, { ...request, snapshot: snapshotCopy(request.snapshot) })
      items.push({ taskId: request.task_id, key: request.key, snapshot: snapshotCopy(request.snapshot), status: 'waiting',
        bytes: 0, total: 0, error: null, skipped: false, cancelling: false })
    }
    items.push(...failures.map(item => ({ ...item, snapshot: snapshotCopy(item.snapshot), status: 'failed' as const,
      error: cacheBatchError(new Error(item.error ?? 'download_failed')), cancelling: false })))
    if (!additions.length && !failures.length) return 0
    this.update({ items, blocked: continuing ? this.state.blocked : false })
    this.persist(true)
    this.start()
    return additions.length + failures.length
  }
  private safeCancel(taskId: string): void { try { this.deps.cancel(taskId) } catch { /* Detached host. */ } }
  cancel(taskId: string): void {
    const item = this.state.items.find(item => item.taskId === taskId)
    if (!item || !active(item)) return
    if (item.status === 'waiting') {
      this.item(taskId, { status: 'cancelled', error: 'cancelled' })
      this.requests.delete(taskId)
    } else {
      this.safeCancel(taskId)
      this.item(taskId, { cancelling: true })
    }
    this.persist()
  }
  cancelRemaining(): void {
    this.retryVersion++
    const items = this.state.items.map(item => {
      if (item.status === 'downloading') {
        this.safeCancel(item.taskId)
        return { ...item, cancelling: true }
      }
      if (item.status === 'waiting' || this.retrying && ['failed', 'interrupted'].includes(item.status)) {
        this.requests.delete(item.taskId)
        return { ...item, status: 'cancelled' as const, error: 'cancelled' }
      }
      return item
    })
    this.update({ items })
    this.persist(true)
  }
  refreshProgress(tasks: readonly CacheTask[]): void {
    const values = new Map(tasks.filter(task => task.namespace === this.state.namespace).map(task => [task.task_id, task]))
    this.update({ items: this.state.items.map(item => {
      const task = values.get(item.taskId)
      return item.status === 'downloading' && task ? { ...item, bytes: task.bytes, total: task.total } : item
    }) })
  }
  async retryFailed(): Promise<number> {
    const namespace = this.state.namespace
    if (!namespace || this.state.running) return 0
    const epoch = this.epoch
    const retryVersion = ++this.retryVersion
    this.retrying = true
    const retry = this.state.items.filter(item => item.status === 'failed' || item.status === 'interrupted' ||
      item.status === 'waiting' && item.error === 'batch_capacity_stop')
    // Reserve the producer while requests are rebuilt; a second retry cannot race it.
    this.update({ running: true })
    let count = 0
    try {
      for (const item of retry) {
        if (epoch !== this.epoch || retryVersion !== this.retryVersion) return count
        try {
          const request = await this.deps.rebuild(item, namespace)
          if (epoch !== this.epoch || retryVersion !== this.retryVersion || request.namespace !== this.state.namespace) return count
          this.requests.delete(item.taskId)
          this.requests.set(request.task_id, request)
          this.update({ items: this.state.items.map(value => value.taskId === item.taskId
            ? { ...value, taskId: request.task_id, key: request.key, snapshot: request.snapshot, status: 'waiting',
              bytes: 0, total: 0, error: null, skipped: false, cancelling: false }
            : value) })
          count++
        } catch (error) {
          if (epoch === this.epoch) this.item(item.taskId, { status: 'failed', error: cacheBatchError(error) })
        }
      }
    } finally {
      if (epoch === this.epoch) {
        this.retrying = false
        this.update({ running: false, blocked: false })
        this.persist()
        this.start()
      }
    }
    return count
  }
  private start(): void {
    if (this.state.running || this.state.blocked || !this.state.namespace || !this.state.items.some(item => item.status === 'waiting')) return
    const epoch = this.epoch
    this.update({ running: true })
    void this.run(epoch).finally(() => {
      if (epoch === this.epoch) {
        this.update({ running: false })
        this.start()
      }
    })
  }
  private async run(epoch: number): Promise<void> {
    while (epoch === this.epoch && !this.state.blocked) {
      const item = this.state.items.find(item => item.status === 'waiting')
      if (!item) return
      const request = this.requests.get(item.taskId)
      if (!request) {
        this.item(item.taskId, { status: 'interrupted', error: 'interrupted' })
        this.persist()
        continue
      }
      this.item(item.taskId, { status: 'downloading' })
      this.persist()
      try {
        const cached = await this.deps.cached(request)
        if (epoch !== this.epoch) return
        if (this.state.items.find(value => value.taskId === item.taskId)?.cancelling) throw new Error('cancelled')
        const entry = cached ?? await this.deps.download(request, task => {
          if (epoch !== this.epoch || task.namespace !== this.state.namespace || task.task_id !== item.taskId) return
          this.item(item.taskId, { bytes: task.bytes, total: task.total })
        })
        if (epoch !== this.epoch) return
        this.item(item.taskId, { status: 'completed', bytes: entry.sizeBytes, total: entry.sizeBytes,
          skipped: !!cached, cancelling: false, error: null })
      } catch (error) {
        if (epoch !== this.epoch) return
        const code = cacheBatchError(error)
        this.item(item.taskId, { status: code === 'cancelled' ? 'cancelled' : 'failed', cancelling: false, error: code })
        if (CAPACITY_ERRORS.has(code)) {
          this.update({ blocked: true, items: this.state.items.map(value => value.status === 'waiting'
            ? { ...value, error: 'batch_capacity_stop' } : value) })
        }
      } finally { this.requests.delete(item.taskId) }
      this.persist()
    }
  }
}
