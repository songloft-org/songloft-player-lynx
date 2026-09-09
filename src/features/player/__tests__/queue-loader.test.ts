import { afterEach, describe, expect, test, vi } from 'vitest'

import type { Song } from '../../../models/song.js'
import { QueueLoader } from '../domain/queue-loader.js'

/**
 * Pure unit tests for the background queue loader (port of the Flutter
 * `QueueLoader`): batch advancement, early stop on an empty page,
 * generation-based cancellation, and retry/backoff. No store, no audio mock.
 */

function song(id: number): Song {
  return { id, type: 'local', title: `Song ${id}`, duration: 1 } as Song
}

afterEach(() => {
  vi.useRealTimers()
})

describe('QueueLoader.loadRemaining', () => {
  test('fetches successive batches until the total is reached', async () => {
    const loader = new QueueLoader()
    const fetch = vi.fn(async (offset: number, limit: number): Promise<Song[]> => {
      const batch: Song[] = []
      for (let i = offset; i < Math.min(offset + limit, 5); i++) batch.push(song(i))
      return batch
    })
    const batches: Song[][] = []

    const ok = await loader.loadRemaining({
      generation: loader.generation,
      totalCount: 5,
      alreadyLoaded: 1,
      fetch,
      onBatch: (b) => batches.push(b),
      pageSize: 2,
    })

    expect(ok).toBe(true)
    expect(fetch.mock.calls).toEqual([[1, 2], [3, 2]])
    expect(batches.map((b) => b.map((s) => s.id))).toEqual([[1, 2], [3, 4]])
  })

  test('does nothing when everything is already loaded', async () => {
    const loader = new QueueLoader()
    const fetch = vi.fn(async (): Promise<Song[]> => [])

    const ok = await loader.loadRemaining({
      generation: loader.generation,
      totalCount: 3,
      alreadyLoaded: 3,
      fetch,
      onBatch: () => {},
    })

    expect(ok).toBe(true)
    expect(fetch).not.toHaveBeenCalled()
  })

  test('stops early when a batch comes back empty (source shrank)', async () => {
    const loader = new QueueLoader()
    const fetch = vi.fn(async (offset: number): Promise<Song[]> =>
      offset < 4 ? [song(offset)] : [])
    const onBatch = vi.fn()

    const ok = await loader.loadRemaining({
      generation: loader.generation,
      totalCount: 100,
      alreadyLoaded: 1,
      fetch,
      onBatch,
      pageSize: 10,
    })

    expect(ok).toBe(true)
    expect(fetch).toHaveBeenCalledTimes(4) // the 4th returns the stop-empty batch
    expect(onBatch).toHaveBeenCalledTimes(3)
  })

  test('advances by the returned batch length, not the requested page size', async () => {
    const loader = new QueueLoader()
    const fetch = vi.fn(async (offset: number): Promise<Song[]> => {
      if (offset === 2) return [song(2), song(3)]
      if (offset === 4) return [song(4)]
      return []
    })

    const ok = await loader.loadRemaining({
      generation: loader.generation,
      totalCount: 5,
      alreadyLoaded: 2,
      fetch,
      onBatch: () => {},
      pageSize: 100,
    })

    expect(ok).toBe(true)
    expect(fetch.mock.calls.map((c) => c[0])).toEqual([2, 4])
  })

  test('an in-flight load aborts once its generation is superseded', async () => {
    vi.useFakeTimers()
    const loader = new QueueLoader()
    const generation = loader.generation
    let release: (songs: Song[]) => void = () => {}
    const fetch = vi.fn(() => new Promise<Song[]>((res) => { release = res }))
    const onBatch = vi.fn()

    const pending = loader.loadRemaining({
      generation,
      totalCount: 100,
      alreadyLoaded: 1,
      fetch,
      onBatch,
    })

    // The user starts new playback while the first batch is in flight.
    loader.invalidate()
    release([song(2)])

    await expect(pending).resolves.toBe(false)
    expect(onBatch).not.toHaveBeenCalled()
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  test('a transient failure retries the same offset after backoff', async () => {
    vi.useFakeTimers()
    const loader = new QueueLoader()
    let attempts = 0
    const fetch = vi.fn(async (): Promise<Song[]> => {
      attempts += 1
      if (attempts === 1) throw new Error('network down')
      return [song(1)]
    })
    const onBatch = vi.fn()

    const pending = loader.loadRemaining({
      generation: loader.generation,
      totalCount: 2,
      alreadyLoaded: 1,
      fetch,
      onBatch,
      maxRetries: 2,
    })

    await vi.advanceTimersByTimeAsync(500)
    await expect(pending).resolves.toBe(true)
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(onBatch).toHaveBeenCalledTimes(1)
  })

  test('a batch that keeps failing ends the load as unsuccessful', async () => {
    vi.useFakeTimers()
    const loader = new QueueLoader()
    const fetch = vi.fn(async (): Promise<Song[]> => {
      throw new Error('network down')
    })
    const onBatch = vi.fn()

    const pending = loader.loadRemaining({
      generation: loader.generation,
      totalCount: 10,
      alreadyLoaded: 1,
      fetch,
      onBatch,
      maxRetries: 3,
    })

    await vi.advanceTimersByTimeAsync(500 + 1000)
    await expect(pending).resolves.toBe(false)
    expect(fetch).toHaveBeenCalledTimes(3)
    expect(onBatch).not.toHaveBeenCalled()
  })
})

describe('QueueLoader generations', () => {
  test('invalidate bumps the generation and marks older ones superseded', () => {
    const loader = new QueueLoader()
    const gen = loader.generation
    expect(loader.isSuperseded(gen)).toBe(false)
    expect(loader.invalidate()).toBe(gen + 1)
    expect(loader.isSuperseded(gen)).toBe(true)
    expect(loader.isSuperseded(loader.generation)).toBe(false)
  })
})
