export class DesktopResources {
  #tasks = new Map()
  #closed = false
  constructor({ native, network }) {
    Object.assign(this, { native, network })
    this.changed = () => this.cancelAll()
    network.on('configure', this.changed)
    native.resource('configure', (id, url, cancelled) => {
      if (cancelled) {
        this.#tasks.get(id)?.abort()
        return
      }
      if (this.#closed) return
      const controller = new AbortController()
      this.#tasks.set(id, controller)
      const timeout = setTimeout(() => controller.abort(), 45000)
      void (async () => {
        try {
          const response = await network.fetch(url, {
            signal: controller.signal,
          })
          if (!response.ok) throw new Error('plugin_resource_failed')
          const chunks = []
          let size = 0
          for await (const chunk of response.body ?? []) {
            size += chunk.length
            if (size > 64 * 1024 * 1024)
              throw new Error('plugin_resource_too_large')
            chunks.push(Buffer.from(chunk))
          }
          native.resource('reply', id, Buffer.concat(chunks), '')
        } catch {
          native.resource('reply', id, null, 'plugin_resource_failed')
        } finally {
          clearTimeout(timeout)
          controller.abort()
          this.#tasks.delete(id)
        }
      })().catch(() => {})
    })
  }
  cancelAll() {
    for (const task of this.#tasks.values()) task.abort()
  }
  close() {
    this.#closed = true
    this.cancelAll()
    this.network.off('configure', this.changed)
    this.native.resource('close')
  }
}
