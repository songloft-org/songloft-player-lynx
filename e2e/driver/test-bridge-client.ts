import { createConnection, type Socket } from 'node:net'

interface PendingRequest {
  resolve: (result: unknown) => void
  reject: (error: Error) => void
}

/**
 * TCP client for the native TestBridgeServer.
 * Communicates via line-delimited JSON over a raw TCP socket.
 *
 * Protocol:
 *   → {"id":1, "method":"eval", "expr":"globalThis.__E2E_PLAYER_STORE__.getState()"}
 *   ← {"id":1, "result":{...}}
 *
 *   → {"id":2, "method":"ping"}
 *   ← {"id":2, "result":"pong"}
 */
export class TestBridgeClient {
  private socket: Socket | null = null
  private nextId = 1
  private pending = new Map<number, PendingRequest>()
  private buffer = ''

  async connect(host: string, port: number, timeout = 10_000): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`TestBridge connect timeout: ${host}:${port}`))
      }, timeout)

      const socket = createConnection({ host, port }, () => {
        clearTimeout(timer)
        this.socket = socket
        resolve()
      })

      socket.setEncoding('utf8')
      socket.on('error', (err) => {
        clearTimeout(timer)
        reject(err)
      })
      socket.on('data', (chunk: string) => {
        this.buffer += chunk
        this.processBuffer()
      })
      socket.on('close', () => {
        for (const [, p] of this.pending) {
          p.reject(new Error('TestBridge connection closed'))
        }
        this.pending.clear()
        this.socket = null
      })
    })
  }

  private processBuffer(): void {
    const lines = this.buffer.split('\n')
    // Keep the last incomplete line in the buffer
    this.buffer = lines.pop() ?? ''

    for (const line of lines) {
      if (!line.trim()) continue
      try {
        const msg = JSON.parse(line)
        const p = this.pending.get(msg.id)
        if (p) {
          this.pending.delete(msg.id)
          if (msg.error) {
            p.reject(new Error(msg.error))
          } else {
            p.resolve(msg.result)
          }
        }
      } catch {
        // malformed line — ignore
      }
    }
  }

  async send(method: string, params?: Record<string, unknown>): Promise<unknown> {
    if (!this.socket) throw new Error('TestBridge not connected')
    const id = this.nextId++
    const msg = { id, method, ...params }
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.socket!.write(JSON.stringify(msg) + '\n')
    })
  }

  async ping(): Promise<boolean> {
    try {
      const result = await this.send('ping')
      return result === 'pong'
    } catch {
      return false
    }
  }

  async evaluate<T = unknown>(expression: string): Promise<T> {
    const result = await this.send('eval', { expr: expression })
    return result as T
  }

  async close(): Promise<void> {
    if (this.socket) {
      this.socket.end()
      this.socket = null
    }
  }

  get connected(): boolean {
    return this.socket != null && !this.socket.destroyed
  }
}
