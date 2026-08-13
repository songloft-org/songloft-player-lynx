import { WebSocket } from 'ws'

interface PendingRequest {
  resolve: (result: unknown) => void
  reject: (error: Error) => void
}

/**
 * Lynx Inspector Protocol client — CDP-like JSON-RPC over WebSocket.
 *
 * The Lynx DevTool service exposes a WebSocket endpoint that accepts
 * Chrome DevTools Protocol-style messages (id + method + params). This
 * wrapper provides typed helpers for the subset we need: JS evaluation,
 * DOM queries, and tap dispatch.
 */
export class LynxInspector {
  private ws: WebSocket | null = null
  private nextId = 1
  private pending = new Map<number, PendingRequest>()

  async connect(url: string, timeout = 10_000): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Inspector connect timeout: ${url}`))
      }, timeout)

      const ws = new WebSocket(url)
      ws.on('open', () => {
        clearTimeout(timer)
        this.ws = ws
        resolve()
      })
      ws.on('error', (err) => {
        clearTimeout(timer)
        reject(err)
      })
      ws.on('message', (data) => {
        this.handleMessage(data.toString())
      })
      ws.on('close', () => {
        for (const [, p] of this.pending) {
          p.reject(new Error('WebSocket closed'))
        }
        this.pending.clear()
        this.ws = null
      })
    })
  }

  private handleMessage(raw: string): void {
    try {
      const msg = JSON.parse(raw)
      if (msg.id != null && this.pending.has(msg.id)) {
        const p = this.pending.get(msg.id)!
        this.pending.delete(msg.id)
        if (msg.error) {
          p.reject(new Error(msg.error.message ?? JSON.stringify(msg.error)))
        } else {
          p.resolve(msg.result)
        }
      }
    } catch {
      // non-JSON or event — ignore
    }
  }

  async send(method: string, params?: Record<string, unknown>): Promise<unknown> {
    if (!this.ws) throw new Error('Inspector not connected')
    const id = this.nextId++
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.ws!.send(JSON.stringify({ id, method, params }))
    })
  }

  /**
   * Evaluate a JS expression in the Lynx BTS runtime context.
   * Returns the deserialized result value.
   */
  async evaluate<T = unknown>(expression: string): Promise<T> {
    const result = (await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
    })) as { result?: { value?: T }; exceptionDetails?: { text: string } }

    if (result.exceptionDetails) {
      throw new Error(`JS eval error: ${result.exceptionDetails.text}`)
    }
    return result.result?.value as T
  }

  /**
   * Query a DOM node by data-testid attribute.
   * Returns the node ID or null if not found.
   */
  async querySelector(testId: string): Promise<number | null> {
    const result = (await this.send('DOM.querySelector', {
      selector: `[data-testid="${testId}"]`,
    })) as { nodeId?: number } | null
    return result?.nodeId ?? null
  }

  /**
   * Query all DOM nodes matching a data-testid.
   */
  async querySelectorAll(testId: string): Promise<number[]> {
    const result = (await this.send('DOM.querySelectorAll', {
      selector: `[data-testid="${testId}"]`,
    })) as { nodeIds?: number[] } | null
    return result?.nodeIds ?? []
  }

  /**
   * Dispatch a tap event on the given node.
   */
  async dispatchTap(nodeId: number): Promise<void> {
    await this.send('Input.dispatchTapEvent', { nodeId })
  }

  /**
   * Get a text content of a node.
   */
  async getNodeText(nodeId: number): Promise<string> {
    const result = (await this.send('DOM.getOuterHTML', { nodeId })) as {
      outerHTML?: string
    } | null
    return result?.outerHTML ?? ''
  }

  /**
   * Check if a node is visible (has non-zero dimensions).
   */
  async isNodeVisible(nodeId: number): Promise<boolean> {
    const result = (await this.send('DOM.getBoxModel', { nodeId })) as {
      model?: { width: number; height: number }
    } | null
    if (!result?.model) return false
    return result.model.width > 0 && result.model.height > 0
  }

  async close(): Promise<void> {
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
  }

  get connected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN
  }
}
