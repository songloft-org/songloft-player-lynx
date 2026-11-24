import { safeClearTimeout } from '../../../native/safe-timers.js'

export interface FavoriteChange {
  cursor: string
  changed: boolean
}

interface WatcherDeps {
  poll: (cursor: string | undefined, assertCurrent: () => void, signal: AbortSignal | undefined) => Promise<FavoriteChange>
  refresh: (assertCurrent: () => void) => Promise<void>
  assertCurrent?: () => void
  unsupported?: (error: unknown) => boolean
  retryMs?: number
}

/** One event-driven hanging request; no periodic full favorite scans. */
export class FavoriteChangeWatcher {
  private stopped = false
  private timer: ReturnType<typeof setTimeout> | undefined
  private wakeRetry: (() => void) | undefined
  private activeRequest: AbortController | undefined
  private running: Promise<void> | undefined
  constructor(private readonly deps: WatcherDeps) {}

  private assertCurrent = () => {
    if (this.stopped) throw new Error('Favorite watcher stopped')
    this.deps.assertCurrent?.()
  }

  run(): Promise<void> {
    if (this.running) return this.running
    this.running = this.runLoop()
    return this.running
  }

  private async runLoop(): Promise<void> {
    let cursor: string | undefined
    let failures = 0
    while (!this.stopped) {
      try {
        this.assertCurrent()
        const controller = typeof AbortController === 'function' ? new AbortController() : undefined
        this.activeRequest = controller
        let event: FavoriteChange
        try {
          event = await this.deps.poll(cursor, this.assertCurrent, controller?.signal)
        } finally {
          if (this.activeRequest === controller) this.activeRequest = undefined
        }
        this.assertCurrent()
        if (event.changed) await this.deps.refresh(this.assertCurrent)
        this.assertCurrent()
        cursor = event.cursor
        failures = 0
      } catch (error) {
        if (this.stopped || this.deps.unsupported?.(error)) return
        try { this.assertCurrent() } catch { return }
        cursor = undefined // Reconcile after failed refresh or reconnect.
        const delay = (this.deps.retryMs ?? 1000) * 2 ** Math.min(failures++, 5)
        await new Promise<void>(resolve => {
          this.wakeRetry = resolve
          this.timer = setTimeout(resolve, delay)
        })
        this.timer = undefined
        this.wakeRetry = undefined
      }
    }
  }

  stop(): void {
    this.stopped = true
    this.activeRequest?.abort()
    safeClearTimeout(this.timer as unknown as number | undefined)
    this.wakeRetry?.()
  }
}
