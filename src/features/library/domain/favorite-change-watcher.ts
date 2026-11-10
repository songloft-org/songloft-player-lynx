import { safeClearTimeout } from '../../../native/safe-timers.js'

export interface FavoriteChange {
  cursor: string
  changed: boolean
}

interface WatcherDeps {
  poll: (cursor: string | undefined, assertCurrent: () => void) => Promise<FavoriteChange>
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
  constructor(private readonly deps: WatcherDeps) {}

  private assertCurrent = () => {
    if (this.stopped) throw new Error('Favorite watcher stopped')
    this.deps.assertCurrent?.()
  }

  async run(): Promise<void> {
    let cursor: string | undefined
    let failures = 0
    while (!this.stopped) {
      try {
        this.assertCurrent()
        const event = await this.deps.poll(cursor, this.assertCurrent)
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
    safeClearTimeout(this.timer as unknown as number | undefined)
    this.wakeRetry?.()
  }
}
