import { common } from '@kit.AbilityKit'
import { fileIo, fileUri, statfs } from '@kit.CoreFileKit'
import { cryptoFramework } from '@kit.CryptoArchitectureKit'
import { util, url } from '@kit.ArkTS'
import { CacheEntry, CacheSnapshot, CacheRequest, CacheLookup, CacheTask, CachePage, CacheMissing, PlayableCacheEntry, CacheLegacyFile } from './SongCacheTypes'
import { SongCacheTransfer } from './SongCacheTransfer'

class CacheJob {
  task: CacheTask
  cancelled: boolean = false
  transfer?: SongCacheTransfer = undefined
  constructor(id: string, namespace: string, key: string) {
    this.task = { task_id: id, namespace: namespace, key: key, status: 'waiting', bytes: 0, total: 0, error: null }
  }
}

/** Process-wide serial writer; no request URL or credential is persisted. */
export class SongCacheStore {
  private static instance?: SongCacheStore = undefined
  private readonly root: string
  private readonly indexed: string
  private readonly tasks: string
  private readonly staging: string
  private readonly entries: Map<string, CacheEntry> = new Map()
  private readonly jobs: Map<string, CacheJob> = new Map()
  private cancelled: string[] = []
  private writes: Promise<void> = Promise.resolve()

  static get(context: common.UIAbilityContext): SongCacheStore {
    if (!SongCacheStore.instance) SongCacheStore.instance = new SongCacheStore(context.filesDir + '/song_cache')
    return SongCacheStore.instance
  }
  private constructor(root: string) {
    this.root = root
    this.indexed = root + '/v2'
    this.tasks = root + '/tasks'
    this.staging = root + '/staging'
    for (const directory of [root, this.indexed, this.tasks, this.staging]) {
      if (!fileIo.accessSync(directory)) fileIo.mkdirSync(directory, true)
    }
    for (const name of this.files(this.staging)) this.removePath(this.staging + '/' + name)
    for (const directory of [root, this.tasks]) {
      for (const name of this.files(directory)) if (name.endsWith('.part')) this.removePath(directory + '/' + name)
    }
    for (const namespace of this.files(this.indexed)) {
      if (!/^[a-f0-9]{64}$/.test(namespace)) continue
      for (const name of this.files(this.indexed + '/' + namespace)) {
        const directory = this.indexed + '/' + namespace + '/' + name
        try {
          const entry = JSON.parse(this.readText(directory + '/entry.json')) as CacheEntry
          this.identity(entry.namespace, entry.key)
          if (directory !== this.entryDirectory(entry.namespace, entry.key) || !Number.isSafeInteger(entry.sizeBytes) ||
            entry.sizeBytes <= 0 || this.sizeOf(this.media(entry)) !== entry.sizeBytes) throw new Error('invalid_cache_request')
          this.entries.set(entry.key, entry)
        } catch (_) { this.removePath(directory) }
      }
    }
    for (const name of this.files(this.tasks)) {
      if (!name.endsWith('.json')) continue
      const path = this.tasks + '/' + name
      try {
        const task = JSON.parse(this.readText(path)) as CacheTask
        if (!/^[A-Za-z0-9_-]{1,96}$/.test(task.task_id) || name !== task.task_id + '.json') throw new Error('invalid_cache_request')
        if (['waiting', 'downloading'].includes(task.status)) {
          task.status = 'interrupted'
          task.error = 'interrupted'
          this.atomic(path, JSON.stringify(task))
        }
      } catch (_) { this.removePath(path) }
    }
    this.pruneTasks()
  }
  private files(path: string): string[] { try { return fileIo.listFileSync(path) } catch (_) { return [] } }
  private sizeOf(path: string): number {
    try { const stat = fileIo.statSync(path); return stat.isFile() ? stat.size : -1 } catch (_) { return -1 }
  }
  private removePath(path: string): void {
    if (!fileIo.accessSync(path)) return
    if (fileIo.statSync(path).isDirectory()) fileIo.rmdirSync(path)
    else fileIo.unlinkSync(path)
  }
  private readText(path: string): string {
    if (this.sizeOf(path) < 0 || this.sizeOf(path) > 65536) throw new Error('invalid_cache_request')
    return fileIo.readTextSync(path)
  }
  private bytes(value: string): Uint8Array { return new util.TextEncoder().encodeInto(value) }
  private hash(value: string): string {
    const digest = cryptoFramework.createMd('SHA256')
    digest.updateSync({ data: this.bytes(value) })
    return Array.from(digest.digestSync().data).map((byte: number) => byte.toString(16).padStart(2, '0')).join('')
  }
  private namespace(raw: string): void {
    if (typeof raw !== 'string' || this.bytes(raw).length > 4096) throw new Error('invalid_cache_request')
    const parts = JSON.parse(raw) as string[]
    if (!Array.isArray(parts) || parts.length !== 3 || parts.some((part: string) => typeof part !== 'string') ||
      parts[0].length < 1 || parts[0].length > 128 || parts[2].length < 1 || parts[2].length > 256 ||
      !SongCacheTransfer.validURL(parts[1])) throw new Error('invalid_cache_request')
    const server = url.URL.parseURL(parts[1])
    if (server.search || server.hash) throw new Error('invalid_cache_request')
  }
  private identity(namespace: string, key: string): string[] {
    this.namespace(namespace)
    if (typeof key !== 'string' || this.bytes(key).length > 8192) throw new Error('invalid_cache_request')
    const parts = JSON.parse(key) as string[]
    if (!Array.isArray(parts) || parts.length !== 7 || parts.some((part: string) => typeof part !== 'string') || parts[0] !== namespace ||
      !/^[1-9][0-9]{0,14}$/.test(parts[1]) || !/^(default|[0-9]{1,6})$/.test(parts[2]) ||
      !['original', '320', '192', '128'].includes(parts[3]) || !['0', '1'].includes(parts[4]) ||
      parts[5].length < 1 || parts[5].length > 128 || !/^[a-z0-9]{1,12}$/.test(parts[6])) throw new Error('invalid_cache_request')
    return parts
  }
  private sameVariant(first: string, second: string): boolean {
    const left = JSON.parse(first) as string[]
    const right = JSON.parse(second) as string[]
    return left.slice(0, 6).every((value: string, index: number) => value === right[index])
  }
  private entryDirectory(namespace: string, key: string): string { return this.indexed + '/' + this.hash(namespace) + '/' + this.hash(key) }
  private media(entry: CacheEntry): string { return this.entryDirectory(entry.namespace, entry.key) + '/media.' + this.identity(entry.namespace, entry.key)[6] }
  private playable(entry: CacheEntry): PlayableCacheEntry {
    const value: PlayableCacheEntry = { namespace: entry.namespace, key: entry.key, snapshot: entry.snapshot,
      sizeBytes: entry.sizeBytes, createdAt: entry.createdAt, cached: true, url: fileUri.getUriFromPath(this.media(entry)) }
    return value
  }
  private available(namespace: string, key: string): CacheEntry | undefined {
    for (const entry of this.entries.values()) {
      if (entry.namespace === namespace && this.sameVariant(entry.key, key) && this.sizeOf(this.media(entry)) === entry.sizeBytes) return entry
    }
    return undefined
  }
  private lookup(raw: string): CacheLookup {
    if (this.bytes(raw).length > 65536) throw new Error('invalid_cache_request')
    const request = JSON.parse(raw) as CacheLookup
    if (!request) throw new Error('invalid_cache_request')
    this.namespace(request.namespace)
    if (request.key !== undefined) this.identity(request.namespace, request.key)
    if (request.song_id !== undefined && (!Number.isSafeInteger(request.song_id) || request.song_id <= 0)) throw new Error('invalid_cache_request')
    return request
  }
  getEntry(raw: string): PlayableCacheEntry | CacheMissing {
    const request = this.lookup(raw)
    let found: CacheEntry | undefined = undefined
    if (request.key !== undefined) found = this.available(request.namespace, request.key)
    else if (request.song_id !== undefined) {
      for (const entry of this.entries.values()) {
        if (entry.namespace === request.namespace && entry.snapshot.id === request.song_id && this.sizeOf(this.media(entry)) === entry.sizeBytes) { found = entry; break }
      }
    } else throw new Error('invalid_cache_request')
    const missing: CacheMissing = { cached: false }
    return found ? this.playable(found) : missing
  }
  listEntries(raw: string): CachePage {
    const request = this.lookup(raw)
    const offset = request.offset === undefined ? 0 : request.offset
    const limit = request.limit === undefined ? 50 : request.limit
    if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 200) throw new Error('invalid_cache_request')
    const all: CacheEntry[] = []
    for (const entry of this.entries.values()) if (entry.namespace === request.namespace && this.sizeOf(this.media(entry)) === entry.sizeBytes) all.push(entry)
    all.sort((first: CacheEntry, second: CacheEntry) => first.key < second.key ? -1 : first.key > second.key ? 1 : 0)
    return { entries: all.slice(offset, offset + limit).map((entry: CacheEntry) => this.playable(entry)), total: all.length,
      bytes: this.size(), legacy_bytes: this.legacySize() }
  }
  private legacyFiles(): string[] {
    return this.files(this.root).filter((name: string) => /^[1-9][0-9]*(\.[a-z0-9]{1,12})?$/.test(name) && this.sizeOf(this.root + '/' + name) >= 0)
  }
  private legacySize(): number { return this.legacyFiles().reduce((bytes: number, name: string) => bytes + this.sizeOf(this.root + '/' + name), 0) }
  size(): number {
    let size = this.legacySize()
    for (const entry of this.entries.values()) size += Math.max(0, this.sizeOf(this.media(entry)))
    return size
  }
  private atomic(path: string, value: string): void {
    const temporary = path + '.part'
    const file = fileIo.openSync(temporary, fileIo.OpenMode.CREATE | fileIo.OpenMode.WRITE_ONLY | fileIo.OpenMode.TRUNC)
    try {
      const bytes = this.bytes(value)
      let offset = 0
      while (offset < bytes.length) {
        const count = fileIo.writeSync(file.fd, bytes.buffer.slice(offset))
        if (count <= 0) throw new Error('cache_storage_unavailable')
        offset += count
      }
      fileIo.fsyncSync(file.fd)
    } catch (error) {
      try { fileIo.unlinkSync(temporary) } catch (_) {}
      throw new Error('cache_storage_unavailable')
    } finally { fileIo.closeSync(file.fd) }
    try { fileIo.renameSync(temporary, path) }
    finally { try { fileIo.unlinkSync(temporary) } catch (_) {} }
  }
  private save(job: CacheJob): void { this.atomic(this.tasks + '/' + job.task.task_id + '.json', JSON.stringify(job.task)) }
  private pruneTasks(): void {
    const names = this.files(this.tasks).filter((name: string) => name.endsWith('.json'))
    names.sort((first: string, second: string) => fileIo.statSync(this.tasks + '/' + second).mtime - fileIo.statSync(this.tasks + '/' + first).mtime)
    for (const name of names.slice(128)) if (!this.jobs.has(name.slice(0, -5))) this.removePath(this.tasks + '/' + name)
  }
  getTasks(): CacheTask[] {
    const values: CacheTask[] = []
    for (const name of this.files(this.tasks)) {
      if (!name.endsWith('.json')) continue
      try {
        const active = this.jobs.get(name.slice(0, -5))
        values.push(active ? active.task : JSON.parse(this.readText(this.tasks + '/' + name)) as CacheTask)
      } catch (_) {}
    }
    return values
  }
  cancel(id: string): void {
    if (!/^[A-Za-z0-9_-]{1,96}$/.test(id)) return
    const job = this.jobs.get(id)
    if (job) { job.cancelled = true; job.transfer?.cancel() }
    this.cancelled = this.cancelled.filter((value: string) => value !== id)
    this.cancelled.push(id)
    if (this.cancelled.length > 64) this.cancelled.shift()
  }
  private snapshot(value: CacheSnapshot, id: string): CacheSnapshot {
    if (!value || String(value.id) !== id || !['local', 'remote'].includes(value.type) || typeof value.title !== 'string' ||
      value.title.length < 1 || value.title.length > 1024 || !Number.isFinite(value.duration) || value.duration < 0 ||
      typeof value.isVideo !== 'boolean') throw new Error('invalid_cache_request')
    const safe: CacheSnapshot = { id: value.id, type: value.type, title: value.title, artist: String(value.artist ?? '').slice(0, 1024),
      album: String(value.album ?? '').slice(0, 1024), duration: value.duration, isVideo: value.isVideo,
      format: String(value.format ?? '').slice(0, 12), updatedAt: String(value.updatedAt ?? '').slice(0, 128) }
    return safe
  }
  cacheEntry(raw: string, progress: (task: CacheTask) => void): Promise<PlayableCacheEntry> {
    if (this.bytes(raw).length > 65536) throw new Error('invalid_cache_request')
    const request = JSON.parse(raw) as CacheRequest
    if (!request) throw new Error('invalid_cache_request')
    const parts = this.identity(request.namespace, request.key)
    request.snapshot = this.snapshot(request.snapshot, parts[1])
    return this.enqueue(request, '', progress) as Promise<PlayableCacheEntry>
  }
  private enqueue(request: CacheRequest, legacy: string, progress: (task: CacheTask) => void): Promise<PlayableCacheEntry | CacheLegacyFile> {
    if (!/^[A-Za-z0-9_-]{1,96}$/.test(request.task_id) || !Number.isSafeInteger(request.max_bytes) || request.max_bytes <= 0 ||
      !SongCacheTransfer.validURL(request.url)) throw new Error('invalid_cache_request')
    if (this.jobs.size >= 32) throw new Error('cache_queue_full')
    if (this.jobs.has(request.task_id) || fileIo.accessSync(this.tasks + '/' + request.task_id + '.json')) throw new Error('invalid_cache_request')
    for (const job of this.jobs.values()) {
      if (request.key && job.task.namespace === request.namespace && this.sameVariant(job.task.key, request.key)) throw new Error('cache_busy')
    }
    const job = new CacheJob(request.task_id, request.namespace, request.key)
    job.cancelled = this.cancelled.includes(request.task_id)
    this.save(job)
    this.jobs.set(request.task_id, job)
    const work = this.writes.then(async (): Promise<PlayableCacheEntry | CacheLegacyFile> => {
      const temporary = this.staging + '/' + request.task_id
      let outcome: PlayableCacheEntry | CacheLegacyFile | undefined = undefined
      let errorCode = ''
      try {
        if (job.cancelled) throw new Error('cancelled')
        const existing = legacy ? undefined : this.available(request.namespace, request.key)
        if (existing) outcome = this.playable(existing)
        else {
          const remaining = request.max_bytes - this.size()
          if (remaining <= 0) throw new Error('limit_exceeded')
          if (statfs.getFreeSizeSync(this.root) < 524288) throw new Error('insufficient_space')
          fileIo.mkdirSync(temporary)
          const part = temporary + '/media.part'
          const format = legacy ? legacy.split('.').pop() ?? '' : this.identity(request.namespace, request.key)[6]
          const transfer = new SongCacheTransfer(remaining, format, !legacy)
          job.transfer = transfer
          job.task.status = 'downloading'
          this.save(job)
          progress(job.task)
          if (job.cancelled) transfer.cancel()
          await transfer.download(request.url, part, (bytes: number, total: number) => {
            job.task.bytes = bytes; job.task.total = total; progress(job.task)
          })
          if (job.cancelled) throw new Error('cancelled')
          if (legacy) {
            fileIo.renameSync(part, legacy)
            outcome = { cached: true, url: fileUri.getUriFromPath(legacy), sizeBytes: transfer.bytes }
          } else {
            const parts = this.identity(request.namespace, request.key)
            parts[6] = transfer.format
            const actual = JSON.stringify(parts)
            const entry: CacheEntry = { namespace: request.namespace, key: actual, snapshot: request.snapshot,
              sizeBytes: transfer.bytes, createdAt: Date.now() }
            fileIo.renameSync(part, temporary + '/media.' + transfer.format)
            this.atomic(temporary + '/entry.json', JSON.stringify(entry))
            const namespaceDir = this.indexed + '/' + this.hash(request.namespace)
            if (!fileIo.accessSync(namespaceDir)) fileIo.mkdirSync(namespaceDir)
            fileIo.renameSync(temporary, this.entryDirectory(request.namespace, actual))
            this.entries.set(actual, entry)
            outcome = this.playable(entry)
          }
        }
        job.task.status = 'completed'
      } catch (error) {
        errorCode = job.cancelled ? 'cancelled' : SongCacheStore.errorCode(error as Error)
        job.task.status = errorCode === 'cancelled' ? 'cancelled' : 'failed'
        job.task.error = errorCode
      }
      try { this.removePath(temporary) } catch (_) { errorCode = 'cache_storage_unavailable'; job.task.status = 'failed'; job.task.error = errorCode }
      job.transfer = undefined
      this.jobs.delete(request.task_id)
      try { this.save(job); this.pruneTasks() } catch (_) { errorCode = 'cache_storage_unavailable'; job.task.status = 'failed'; job.task.error = errorCode }
      try { progress(job.task) } catch (_) { /* A detached view cannot undo a durable result. */ }
      if (errorCode || !outcome) throw new Error(errorCode || 'download_failed')
      return outcome
    })
    this.writes = work.then(() => {}).catch(() => {})
    return work
  }
  static errorCode(error: Error): string {
    const allowed: string[] = ['invalid_cache_request', 'cache_queue_full', 'cache_busy', 'cache_storage_unavailable',
      'limit_exceeded', 'insufficient_space', 'cancelled', 'download_failed', 'unsupported_media']
    return allowed.includes(error.message) ? error.message : 'download_failed'
  }
  private mutate(action: () => void): Promise<void> {
    const operation = this.writes.then(action)
    this.writes = operation.catch(() => {})
    return operation
  }
  remove(raw: string): Promise<void> {
    const request = this.lookup(raw)
    if (request.key === undefined && request.song_id === undefined) throw new Error('invalid_cache_request')
    return this.mutate(() => {
      for (const entry of Array.from(this.entries.values())) {
        if (entry.namespace !== request.namespace || !(request.key ? this.sameVariant(entry.key, request.key) : entry.snapshot.id === request.song_id)) continue
        this.removePath(this.entryDirectory(entry.namespace, entry.key)); this.entries.delete(entry.key)
      }
    })
  }
  clearNamespace(namespace: string): Promise<void> {
    this.namespace(namespace)
    for (const job of this.jobs.values()) if (job.task.namespace === namespace) this.cancel(job.task.task_id)
    return this.mutate(() => {
      for (const entry of Array.from(this.entries.values())) if (entry.namespace === namespace) {
        this.removePath(this.entryDirectory(namespace, entry.key)); this.entries.delete(entry.key)
      }
    })
  }
  clearLegacy(): Promise<void> {
    for (const job of this.jobs.values()) if (!job.task.namespace) this.cancel(job.task.task_id)
    return this.mutate(() => { for (const name of this.legacyFiles()) this.removePath(this.root + '/' + name) })
  }
  clearAll(): Promise<void> {
    for (const id of this.jobs.keys()) this.cancel(id)
    return this.mutate(() => {
      for (const name of this.legacyFiles()) this.removePath(this.root + '/' + name)
      for (const name of this.files(this.indexed)) this.removePath(this.indexed + '/' + name)
      this.entries.clear()
    })
  }
  legacyInfo(id: string): CacheLegacyFile | CacheMissing {
    const name = this.legacyFiles().find((name: string) => name === id || name.startsWith(id + '.'))
    const missing: CacheMissing = { cached: false }
    if (!name) return missing
    return { cached: true, url: fileUri.getUriFromPath(this.root + '/' + name), sizeBytes: this.sizeOf(this.root + '/' + name) }
  }
  legacyRemove(id: string): Promise<void> {
    return this.mutate(() => { for (const name of this.legacyFiles()) if (name === id || name.startsWith(id + '.')) this.removePath(this.root + '/' + name) })
  }
  legacyDownload(id: string, remote: string, ext: string, maximum: number): Promise<CacheLegacyFile> {
    if (!/^[1-9][0-9]{0,14}$/.test(id) || !/^[a-z0-9]{0,12}$/.test(ext)) throw new Error('invalid_cache_request')
    const snapshot: CacheSnapshot = { id: Number(id), type: 'local', title: '', artist: '', album: '', duration: 0, isVideo: false, format: '', updatedAt: '' }
    const request: CacheRequest = { task_id: 'legacy-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12),
      namespace: '', key: '', url: remote, max_bytes: maximum, snapshot: snapshot }
    const path = this.root + '/' + (ext ? id + '.' + ext : id)
    return this.enqueue(request, path, () => {}) as Promise<CacheLegacyFile>
  }
}
