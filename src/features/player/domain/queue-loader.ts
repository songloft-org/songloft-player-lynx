import type { Song } from '../../../models/song.js'

/**
 * Background queue loader — the Lynx port of the Flutter `QueueLoader`
 * (`clients/player/lib/features/player/domain/use_cases/queue_loader.dart`).
 *
 * Paginated library / category / playlist views hand the player only the pages
 * they have already fetched, so without a background fill the queue gets
 * truncated at whatever the list had scrolled in
 * (songloft-player-lynx#9 — "播放全部只加了20首"). This class fetches the
 * remainder in batches and appends each batch through the caller's `onBatch`,
 * exactly like the Flutter reference.
 *
 * A generation counter handles cancellation: every playback-start path in the
 * store bumps it via {@link invalidate}, and any in-flight load snapshotting an
 * older generation aborts at its next check point. This is what keeps a stale
 * background fill from appending into a queue the user has since replaced.
 *
 * Pure TypeScript — no store, no API, no timers beyond {@link delay} — so it is
 * unit-testable in isolation (batch-4 test rule).
 */

/** Page fetcher: given an `offset` and `limit`, return one batch of songs. */
export type FetchPage = (offset: number, limit: number) => Promise<Song[]>

/** Called once per successfully fetched batch. */
export type OnBatchLoaded = (songs: Song[]) => void

export interface LoadRemainingParams {
  /** Generation snapshot taken when the load started. */
  generation: number
  /** Total songs in the source list (server `total`). */
  totalCount: number
  /** How many songs the caller has already queued. */
  alreadyLoaded: number
  fetch: FetchPage
  onBatch: OnBatchLoaded
  pageSize?: number
  maxRetries?: number
}

/** Flutter parity: 500ms, then 1000ms, … between retry attempts. */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

export class QueueLoader {
  /** Batch size for background fills (Flutter parity: 100). */
  static readonly DEFAULT_PAGE_SIZE = 100
  /** Max attempts per batch before the whole load fails. */
  static readonly DEFAULT_MAX_RETRIES = 3

  private _generation = 0

  /** Current generation value (readable for synchronous snapshots). */
  get generation(): number {
    return this._generation
  }

  /** Bump the generation so all in-flight loads exit at their next check. */
  invalidate(): number {
    this._generation += 1
    return this._generation
  }

  /** Whether `generation` has been superseded by a newer operation. */
  isSuperseded(generation: number): boolean {
    return generation !== this._generation
  }

  /**
   * Fetch from `alreadyLoaded` to `totalCount` in batches, calling `onBatch`
   * after each. Stops early when a batch comes back empty (the source shrank).
   *
   * Returns true when the load completed normally, false when superseded or
   * when a batch failed after all retries.
   */
  async loadRemaining(params: LoadRemainingParams): Promise<boolean> {
    const pageSize = params.pageSize ?? QueueLoader.DEFAULT_PAGE_SIZE
    const maxRetries = params.maxRetries ?? QueueLoader.DEFAULT_MAX_RETRIES
    let offset = params.alreadyLoaded
    try {
      while (offset < params.totalCount) {
        // Check before the request so a superseded load issues no further I/O.
        if (this.isSuperseded(params.generation)) return false

        let batch: Song[] | undefined
        for (let retry = 0; retry < maxRetries; retry++) {
          try {
            batch = await params.fetch(offset, pageSize)
            break
          } catch (err) {
            if (retry === maxRetries - 1) throw err
            await delay(500 * (retry + 1))
          }
        }

        // And again after: the response may have landed post-invalidate.
        if (this.isSuperseded(params.generation)) return false
        if (batch === undefined || batch.length === 0) break

        params.onBatch(batch)
        offset += batch.length
      }
    } catch {
      // Failed batch (retries exhausted): caller already appended what worked.
      return false
    }
    return !this.isSuperseded(params.generation)
  }
}
