import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { act, renderHook } from '@lynx-js/react/testing-library'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { useDebounce } from '../data/use-debounce.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

/**
 * Timing behaviour of the library search debounce.
 *
 * Batch 40 replaced a source-inspection test here — it asserted that
 * `use-debounce.ts` *contained the strings* `setTimeout` / `clearTimeout`, which
 * says nothing about whether the hook debounces. A hook that fired on every
 * keystroke, or that leaked an intermediate value, would have passed. These
 * tests drive the real hook on fake timers instead.
 */
describe('useDebounce', () => {
  const DELAY = 400

  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  const setup = (value: string) =>
    renderHook(({ value }: { value: string }) => useDebounce(value, DELAY), {
      initialProps: { value },
    })

  test('reports the initial value without waiting', () => {
    const { result } = setup('jazz')
    expect(result.current).toBe('jazz')
  })

  test('withholds a new value until the delay has fully elapsed', () => {
    const { result, rerender } = setup('a')

    rerender({ value: 'b' })
    expect(result.current).toBe('a')

    // One millisecond short — an off-by-one here is the difference between
    // debouncing and not.
    act(() => {
      vi.advanceTimersByTime(DELAY - 1)
    })
    expect(result.current).toBe('a')

    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(result.current).toBe('b')
  })

  /**
   * The actual point of the hook: typing "jazz" one letter at a time must cost
   * one query, not four. Each keystroke has to *cancel* the pending timer, which
   * is the half a source grep for `clearTimeout` cannot check.
   */
  test('a burst of changes emits only the final value, once', () => {
    const { result, rerender } = setup('j')

    for (const value of ['ja', 'jaz', 'jazz']) {
      act(() => {
        vi.advanceTimersByTime(DELAY - 100) // keep typing before the timer fires
      })
      rerender({ value })
      expect(result.current).toBe('j') // no intermediate value ever surfaces
    }

    act(() => {
      vi.advanceTimersByTime(DELAY)
    })
    expect(result.current).toBe('jazz')
  })

  test('a value that reverts before the delay never emits at all', () => {
    const { result, rerender } = setup('rock')

    rerender({ value: 'rocks' })
    act(() => {
      vi.advanceTimersByTime(DELAY - 50)
    })
    rerender({ value: 'rock' })
    act(() => {
      vi.advanceTimersByTime(DELAY * 2)
    })
    expect(result.current).toBe('rock')
  })

  test('pending updates are dropped on unmount', () => {
    const { result, rerender, unmount } = setup('a')

    rerender({ value: 'b' })
    unmount()
    act(() => {
      vi.advanceTimersByTime(DELAY * 2)
    })
    // Nothing should have been committed after teardown.
    expect(result.current).toBe('a')
  })
})

describe('debounce integration: search keyword passes through buildSongsQuery', () => {
  test('debounced keyword "jazz" appears in query', async () => {
    const { buildSongsQuery } = await import('../api/songs-api.js')
    const q = buildSongsQuery({ keyword: 'jazz', sort: 'added_at', order: 'desc' })
    expect(q.keyword).toBe('jazz')
  })

  test('empty debounced keyword is omitted from query', async () => {
    const { buildSongsQuery } = await import('../api/songs-api.js')
    const q = buildSongsQuery({ sort: 'added_at', order: 'desc' })
    expect(q).not.toHaveProperty('keyword')
  })

  /**
   * The delay itself is a UX judgement, not a behaviour the hook can assert, so
   * it stays a source check: the page must pass something in the range that felt
   * right on device (below ~300ms the list flickers mid-word; above ~500ms it
   * feels unresponsive).
   */
  test('debounce delay constant is between 300-500ms', () => {
    const source = readFileSync(
      resolve(__dirname, '../pages/LibraryPage.tsx'),
      'utf-8',
    )
    const match = source.match(/DEBOUNCE_MS\s*=\s*(\d+)/)
    expect(match).not.toBeNull()
    const ms = Number(match![1])
    expect(ms).toBeGreaterThanOrEqual(300)
    expect(ms).toBeLessThanOrEqual(500)
  })
})
