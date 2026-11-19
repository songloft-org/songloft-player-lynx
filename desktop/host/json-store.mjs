import { mkdir, open, readFile, rename, unlink } from 'node:fs/promises'
import { dirname } from 'node:path'
import { randomUUID } from 'node:crypto'

/** Serialize mutations, publish with rename, and never replace corrupt user data. */
export class JsonStore {
  #tail = Promise.resolve()
  constructor(path) {
    this.path = path
  }
  async #read() {
    try {
      const value = JSON.parse(await readFile(this.path, 'utf8'))
      if (!value || Array.isArray(value) || typeof value !== 'object')
        throw new Error('Invalid store')
      return value
    } catch (error) {
      if (error.code === 'ENOENT') return Object.create(null)
      throw new Error(`Cannot read application store: ${this.path}`, {
        cause: error,
      })
    }
  }
  async get(key) {
    await this.#tail
    const data = await this.#read()
    return Object.hasOwn(data, key) ? data[key] : null
  }
  async keys() {
    await this.#tail
    return Object.keys(await this.#read())
  }
  set(key, value) {
    return this.#mutate((data) => {
      Object.defineProperty(data, key, {
        value,
        enumerable: true,
        configurable: true,
        writable: true,
      })
    })
  }
  remove(key) {
    return this.#mutate((data) => {
      delete data[key]
    })
  }
  #mutate(change) {
    const operation = this.#tail.then(async () => {
      const data = await this.#read()
      change(data)
      await mkdir(dirname(this.path), { recursive: true, mode: 0o700 })
      const temporary = `${this.path}.${randomUUID()}.part`
      let file
      try {
        file = await open(temporary, 'wx', 0o600)
        await file.writeFile(JSON.stringify(data))
        await file.sync()
        await file.close()
        file = null
        await rename(temporary, this.path)
      } finally {
        await file?.close()
        await unlink(temporary).catch((error) => {
          if (error.code !== 'ENOENT') throw error
        })
      }
    })
    this.#tail = operation.catch(() => {})
    return operation
  }
}
