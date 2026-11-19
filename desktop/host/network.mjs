import { Agent, ProxyAgent, fetch, WebSocket } from 'undici'
import { EventEmitter } from 'node:events'

// Each host owns its transport. TLS preferences never modify process-wide trust.
export class HostNetwork extends EventEmitter {
  #dispatcher
  #tasks = new Set()
  #options = { insecureTls: false, proxy: null }
  constructor() {
    super()
    this.configure({})
  }
  configure(options) {
    const next = { ...this.#options, ...options }
    if (typeof next.insecureTls !== 'boolean')
      throw new Error('Invalid TLS setting')
    if (next.proxy) {
      const url = new URL(next.proxy)
      if (!['http:', 'https:'].includes(url.protocol))
        throw new Error('Invalid proxy')
    }
    const tls = { rejectUnauthorized: !next.insecureTls }
    const dispatcher = next.proxy
      ? new ProxyAgent({ uri: next.proxy, requestTls: tls, proxyTls: tls })
      : new Agent({ connect: tls })
    const previous = this.#dispatcher
    this.cancelAll()
    this.#dispatcher = dispatcher
    this.#options = next
    this.emit('configure')
    previous?.destroy().catch(() => {})
    return null
  }
  get options() {
    return { ...this.#options }
  }
  websocket(url, headers = {}) {
    const parsed = new URL(url)
    if (
      !['ws:', 'wss:'].includes(parsed.protocol) ||
      parsed.username ||
      parsed.password
    )
      throw new Error('Invalid socket URL')
    return new WebSocket(parsed, { dispatcher: this.#dispatcher, headers })
  }
  async fetch(url, init = {}) {
    const parsed = new URL(url)
    if (
      !['http:', 'https:'].includes(parsed.protocol) ||
      parsed.username ||
      parsed.password
    )
      throw new Error('Invalid request URL')
    return fetch(parsed, { ...init, dispatcher: this.#dispatcher })
  }
  async request({
    url,
    method = 'GET',
    headers = {},
    body,
    timeoutMs = 30000,
    redirect,
  }) {
    if (!Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 300000)
      throw new Error('Invalid request timeout')
    const controller = new AbortController()
    this.#tasks.add(controller)
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const response = await this.fetch(url, {
        method,
        headers,
        ...(body == null ? {} : { body }),
        redirect: redirect === 'error' ? 'error' : 'follow',
        signal: controller.signal,
      })
      const chunks = []
      let bytes = 0
      for await (const chunk of response.body ?? []) {
        bytes += chunk.length
        if (bytes > 32 * 1024 * 1024) {
          controller.abort()
          throw new Error('Response too large')
        }
        chunks.push(Buffer.from(chunk))
      }
      return {
        status: response.status,
        headers: Object.fromEntries(response.headers),
        body: Buffer.concat(chunks).toString('utf8'),
      }
    } finally {
      clearTimeout(timer)
      this.#tasks.delete(controller)
    }
  }
  cancelAll() {
    for (const task of this.#tasks) task.abort()
    this.#tasks.clear()
    return null
  }
  async close() {
    this.cancelAll()
    await this.#dispatcher.destroy()
  }
}
