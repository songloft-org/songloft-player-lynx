import { beforeEach, describe, expect, test, vi } from 'vitest'

import { createMemoryStorage } from '../../../core/storage/index.js'

const {
  PREF_RAIL_COLLAPSED,
  applySavedRailCollapsed,
  getRailCollapsed,
  readRailCollapsed,
  resetRailCollapsedForTests,
  subscribeRailCollapsed,
  toggleRailCollapsed,
  writeRailCollapsed,
} = await import('../rail-collapse.js')

/**
 * The rail's collapse state and its persistence.
 *
 * The store is module-level (a remount of `ShellLayout` — `/player` is a
 * chrome-less route — must not reset it), so every case starts from the reset
 * seam rather than assuming a fresh module.
 */

beforeEach(() => {
  resetRailCollapsedForTests()
})

describe('the live value', () => {
  test('starts expanded', () => {
    expect(getRailCollapsed()).toBe(false)
  })

  test('toggling flips the value and notifies subscribers once', () => {
    const seen: boolean[] = []
    const unsubscribe = subscribeRailCollapsed(() => seen.push(getRailCollapsed()))

    expect(toggleRailCollapsed(createMemoryStorage())).toBe(true)
    expect(getRailCollapsed()).toBe(true)
    expect(toggleRailCollapsed(createMemoryStorage())).toBe(false)
    expect(getRailCollapsed()).toBe(false)

    unsubscribe()
    expect(seen).toEqual([true, false])
  })

  test('an unsubscribed listener stops hearing about flips', () => {
    let calls = 0
    const unsubscribe = subscribeRailCollapsed(() => { calls++ })
    toggleRailCollapsed(createMemoryStorage())
    unsubscribe()
    toggleRailCollapsed(createMemoryStorage())
    expect(calls).toBe(1)
  })
})

describe('persistence', () => {
  test('a toggle writes the pref, and the value round-trips', async () => {
    const storage = createMemoryStorage()
    toggleRailCollapsed(storage)
    // The write is fire-and-forget; let its microtask land.
    await Promise.resolve()
    expect(await storage.prefs.get(PREF_RAIL_COLLAPSED)).toBe('true')
    expect(await readRailCollapsed(storage)).toBe(true)
  })

  test('startup applies the stored value', async () => {
    const storage = createMemoryStorage()
    await storage.prefs.set(PREF_RAIL_COLLAPSED, 'true')
    expect(await applySavedRailCollapsed(storage)).toBe(true)
    expect(getRailCollapsed()).toBe(true)
  })

  test('a missing or unknown value reads as expanded, never throws', async () => {
    const storage = createMemoryStorage()
    expect(await readRailCollapsed(storage)).toBe(false)

    await storage.prefs.set(PREF_RAIL_COLLAPSED, 'yes')
    expect(await readRailCollapsed(storage)).toBe(false)
    // Applying it also collapses nothing: unknown input must not hide the rail.
    await applySavedRailCollapsed(storage)
    expect(getRailCollapsed()).toBe(false)
  })

  test('a rejecting native prefs stub never breaks the state', async () => {
    const rejecting = {
      prefs: {
        get: vi.fn().mockRejectedValue(new Error('not implemented')),
        set: vi.fn().mockRejectedValue(new Error('not implemented')),
        remove: vi.fn().mockRejectedValue(new Error('not implemented')),
        keys: vi.fn().mockRejectedValue(new Error('not implemented')),
      },
      secure: {
        get: vi.fn(), set: vi.fn(), remove: vi.fn(),
      },
      paths: { appData: vi.fn(), cache: vi.fn(), documents: vi.fn() },
    }

    expect(await applySavedRailCollapsed(rejecting as never)).toBe(false)
    expect(toggleRailCollapsed(rejecting as never)).toBe(true)
    expect(getRailCollapsed()).toBe(true)
    await writeRailCollapsed(false, rejecting as never)
    expect(getRailCollapsed()).toBe(true) // the write failure does not roll back
    expect(rejecting.prefs.set).toHaveBeenCalledWith(PREF_RAIL_COLLAPSED, 'false')
  })
})
