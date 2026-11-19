import { mkdir, appendFile, stat, rename, readFile } from 'node:fs/promises'
import { join } from 'node:path'

export function redactLog(raw) {
  const line = String(raw).slice(0, 16384)
  if (
    /(?:password|密码|凭据|secret|authorization|(?:set-)?cookie|token|access[_-]?token|refresh[_-]?token)["']?\s*[:=]/i.test(
      line,
    )
  )
    return '[redacted credentials]'
  return line
    .replace(/https?:\/\/[^\s"'<>]+/gi, '[URL]')
    .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
}
export class DesktopLog {
  #tail = Promise.resolve()
  constructor(directory) {
    this.directory = directory
    this.path = join(directory, 'client.log')
  }
  write(line) {
    const operation = this.#tail.then(async () => {
      await mkdir(this.directory, { recursive: true, mode: 0o700 })
      let size = 0
      try {
        size = (await stat(this.path)).size
      } catch (error) {
        if (error.code !== 'ENOENT') throw error
      }
      if (size >= 5 * 1024 * 1024)
        await rename(this.path, `${this.path}.previous`)
      await appendFile(this.path, `${redactLog(line)}\n`, { mode: 0o600 })
    })
    this.#tail = operation.catch(() => {})
    return operation
  }
  async read() {
    await this.#tail
    try {
      return await readFile(this.path, 'utf8')
    } catch (error) {
      if (error.code === 'ENOENT') return null
      throw error
    }
  }
  async close() {
    await this.#tail
  }
}
