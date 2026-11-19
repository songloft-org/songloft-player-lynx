import { EventEmitter } from 'node:events'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, open, rename, unlink, stat, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { JsonStore } from './json-store.mjs'

const hash = (value) => createHash('sha256').update(value).digest('hex')
function identity(request) {
  const scope = JSON.parse(request.namespace)
  if (
    !Array.isArray(scope) ||
    scope.length !== 3 ||
    !scope.every((value) => typeof value === 'string') ||
    scope[0].length > 128 ||
    !scope[2] ||
    scope[2].length > 256
  )
    throw new Error('invalid_cache_identity')
  const server = new URL(scope[1])
  if (
    !['http:', 'https:'].includes(server.protocol) ||
    server.username ||
    server.password ||
    server.search ||
    server.hash
  )
    throw new Error('invalid_cache_identity')
  if (request.key) {
    const key = JSON.parse(request.key)
    if (
      !Array.isArray(key) ||
      key.length !== 7 ||
      key[0] !== request.namespace ||
      !/^[1-9]\d*$/.test(key[1]) ||
      !/^[a-z0-9]{1,12}$/.test(key[6])
    )
      throw new Error('invalid_cache_identity')
    return key
  }
  return null
}

/** Version-2 cache: one bounded writer, immutable media files, atomic index. */
export class DesktopCache extends EventEmitter {
  #tail = Promise.resolve()
  #tasks = new Map()
  #ready
  constructor({ directory, network }) {
    super()
    Object.assign(this, { directory, network })
    this.index = new JsonStore(join(directory, 'index.json'))
    this.#ready = this.#recover()
  }
  async #recover() {
    await mkdir(this.directory, { recursive: true, mode: 0o700 })
    const entries = await this.#entries()
    const retained = new Set(Object.values(entries).map((value) => value.file))
    for (const file of await readdir(this.directory))
      if (
        (file.endsWith('.part') ||
          /^[a-f0-9]{64}-[a-f0-9-]+\.[a-z0-9]{1,12}$/.test(file)) &&
        !retained.has(file)
      )
        await unlink(join(this.directory, file))
  }
  async #entries() {
    return (await this.index.get('entries')) ?? {}
  }
  ready() {
    return this.#ready
  }
  #queue(action) {
    const run = this.#tail.then(() => this.#ready).then(action)
    this.#tail = run.catch(() => {})
    return run
  }
  #progress(task) {
    const { controller: _, ...publicTask } = task
    this.emit('progress', publicTask)
  }
  async #public(entry) {
    try {
      const file = join(this.directory, entry.file)
      const info = await stat(file)
      if (info.size !== entry.sizeBytes) return null
      const { file: _, ...result } = entry
      return { ...result, cached: true, url: pathToFileURL(file).href }
    } catch (error) {
      if (error.code === 'ENOENT') return null
      throw error
    }
  }
  async cacheEntry(request) {
    const key = identity(request)
    if (
      !key ||
      !/^[A-Za-z0-9_-]{1,96}$/.test(request.task_id) ||
      !Number.isSafeInteger(request.max_bytes) ||
      request.max_bytes < 1 ||
      !request.snapshot ||
      request.snapshot.id !== Number(key[1]) ||
      !['local', 'remote'].includes(request.snapshot.type) ||
      typeof request.snapshot.title !== 'string'
    )
      throw new Error('invalid_cache_request')
    if (this.#tasks.has(request.task_id))
      throw new Error('duplicate_cache_task')
    const task = {
      task_id: request.task_id,
      namespace: request.namespace,
      key: request.key,
      bytes: 0,
      total: 0,
      error: null,
      status: 'waiting',
      controller: new AbortController(),
    }
    this.#tasks.set(task.task_id, task)
    this.#progress(task)
    return this.#queue(async () => {
      const entries = await this.#entries()
      const id = hash(request.key)
      const prior = entries[id]
      const base =
        Object.values(entries).reduce((sum, item) => sum + item.sizeBytes, 0) -
        (prior?.sizeBytes ?? 0)
      const file = `${id}-${randomUUID()}.${key[6]}`
      const finalPath = join(this.directory, file)
      const temporary = `${finalPath}.part`
      let handle,
        published = false
      const timeout = setTimeout(() => task.controller.abort(), 20 * 60 * 1000)
      try {
        task.controller.signal.throwIfAborted()
        task.status = 'downloading'
        this.#progress(task)
        const response = await this.network.fetch(request.url, {
          signal: task.controller.signal,
        })
        if (!response.ok || response.status === 206)
          throw new Error('cache_download_failed')
        task.total = Number(response.headers.get('content-length')) || 0
        if (base + task.total > request.max_bytes)
          throw new Error('limit_exceeded')
        handle = await open(temporary, 'wx', 0o600)
        let lastProgress = 0
        for await (const chunk of response.body ?? []) {
          task.controller.signal.throwIfAborted()
          if (base + task.bytes + chunk.length > request.max_bytes)
            throw new Error('limit_exceeded')
          // FileHandle.writeFile consumes each full chunk (write may be partial).
          await handle.writeFile(chunk)
          task.bytes += chunk.length
          if (Date.now() - lastProgress > 200) {
            this.#progress(task)
            lastProgress = Date.now()
          }
        }
        if (task.bytes === 0 || (task.total && task.total !== task.bytes))
          throw new Error('cache_download_failed')
        await handle.sync()
        await handle.close()
        handle = null
        task.controller.signal.throwIfAborted()
        await rename(temporary, finalPath)
        const entry = {
          namespace: request.namespace,
          key: request.key,
          snapshot: request.snapshot,
          file,
          sizeBytes: task.bytes,
          createdAt: Date.now(),
        }
        entries[id] = entry
        await this.index.set('entries', entries)
        published = true
        if (prior?.file)
          await unlink(join(this.directory, prior.file)).catch(() => {})
        task.status = 'completed'
        this.#progress(task)
        return this.#public(entry)
      } catch (error) {
        task.status = task.controller.signal.aborted ? 'cancelled' : 'failed'
        task.error =
          error.message === 'limit_exceeded'
            ? 'limit_exceeded'
            : task.status === 'cancelled'
              ? 'cancelled'
              : 'cache_download_failed'
        this.#progress(task)
        throw new Error(task.error)
      } finally {
        clearTimeout(timeout)
        task.controller.abort()
        await handle?.close()
        await unlink(temporary).catch(() => {})
        if (!published) await unlink(finalPath).catch(() => {})
        // Bounded task history; running/waiting work is retained.
        if (this.#tasks.size > 200)
          for (const [key, value] of this.#tasks)
            if (
              !['waiting', 'downloading'].includes(value.status) &&
              this.#tasks.size > 200
            )
              this.#tasks.delete(key)
      }
    })
  }
  async getEntry(request) {
    identity(request)
    await this.#ready
    const entries = Object.values(await this.#entries())
      .filter(
        (entry) =>
          entry.namespace === request.namespace &&
          (request.key
            ? entry.key === request.key
            : entry.snapshot.id === request.song_id),
      )
      .sort((a, b) => b.createdAt - a.createdAt)
    for (const entry of entries) {
      const value = await this.#public(entry)
      if (value) return value
    }
    return { cached: false }
  }
  async listEntries(request) {
    identity(request)
    await this.#ready
    const offset = request.offset ?? 0,
      limit = request.limit ?? 100
    if (
      ![offset, limit].every(Number.isSafeInteger) ||
      offset < 0 ||
      limit < 1 ||
      limit > 1000
    )
      throw new Error('invalid_cache_request')
    const entries = []
    for (const entry of Object.values(await this.#entries()))
      if (entry.namespace === request.namespace) {
        const value = await this.#public(entry)
        if (value) entries.push(value)
      }
    entries.sort((a, b) => b.createdAt - a.createdAt)
    return {
      entries: entries.slice(offset, offset + limit),
      total: entries.length,
      bytes: entries.reduce((sum, item) => sum + item.sizeBytes, 0),
      legacy_bytes: 0,
    }
  }
  removeEntry(request) {
    return this.#remove(request, false)
  }
  clearNamespace(request) {
    return this.#remove(request, true)
  }
  async #remove(request, all) {
    identity(request)
    for (const task of this.#tasks.values())
      if (
        task.namespace === request.namespace &&
        (all ||
          (request.key
            ? task.key === request.key
            : JSON.parse(task.key)[1] === String(request.song_id)))
      )
        task.controller.abort()
    return this.#queue(async () => {
      const entries = await this.#entries(),
        files = []
      for (const [id, entry] of Object.entries(entries))
        if (
          entry.namespace === request.namespace &&
          (all ||
            (request.key
              ? entry.key === request.key
              : entry.snapshot.id === request.song_id))
        ) {
          files.push(entry.file)
          delete entries[id]
        }
      await this.index.set('entries', entries)
      for (const file of files)
        await unlink(join(this.directory, file)).catch(() => {})
      return {}
    })
  }
  getTasks() {
    return {
      tasks: [...this.#tasks.values()].map(
        ({ controller: _, ...task }) => task,
      ),
    }
  }
  cancelTask({ task_id }) {
    this.#tasks.get(task_id)?.controller.abort()
    return {}
  }
  async cancelAll() {
    for (const task of this.#tasks.values()) task.controller.abort()
    await this.#tail
  }
  async close() {
    await this.cancelAll()
  }
}
