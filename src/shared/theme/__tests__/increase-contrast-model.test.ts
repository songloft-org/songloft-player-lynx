import { beforeEach, describe, expect, test, vi } from 'vitest'

import { createMemoryStorage } from '../../../core/storage/index.js'
import type { SongloftStorage } from '../../../core/storage/types.js'
import {
  applySavedIncreaseContrast,
  changeIncreaseContrast,
  coerceIncreaseContrast,
  getIncreaseContrast,
  PREF_INCREASE_CONTRAST,
  readSavedIncreaseContrast,
  subscribeIncreaseContrast,
} from '../increase-contrast-model.js'

/**
 * The class this model drives — `.increase-contrast` — has been sitting in
 * `tokens.css` since the Apple Design System migration with nothing ever adding
 * it (the same "written but never wired" shape as the `:active` press states).
 * These gates pin the two halves that wiring needs: the live flag + subscribe
 * pair `ThemeProvider` renders from, and the persisted pref replayed at startup.
 */

/** A prefs store that rejects every call — the native-stub / prefs-unavailable
 *  case. Startup must degrade to the default rather than throw (AGENTS §2). */
function unreadableStorage(): SongloftStorage {
  const base = createMemoryStorage()
  const boom = async () => {
    throw new Error('prefs unavailable')
  }
  return {
    ...base,
    prefs: { ...base.prefs, get: boom, set: boom, remove: boom },
  }
}

describe('coerceIncreaseContrast', () => {
  test('a stored "true" is on', () => {
    expect(coerceIncreaseContrast('true')).toBe(true)
  })

  test.each([null, undefined, '', 'false', 'TRUE', '0', '1', 'yes', 'system'])(
    'coerces %j to off',
    (raw) => {
      expect(coerceIncreaseContrast(raw)).toBe(false)
    },
  )
})

describe('live flag + subscribe', () => {
  beforeEach(async () => {
    // Module state is shared across a file, so every test starts from off —
    // the same reset the theme/material model gates do via their change fn.
    await changeIncreaseContrast(false, createMemoryStorage())
  })

  test('a pristine module defaults to off', async () => {
    // The safety property: "nothing ever said increase contrast" must never
    // resolve to the deepened palette. Checked on a fresh module instance so the
    // assertions above cannot have pre-set the flag.
    vi.resetModules()
    const fresh = await import('../increase-contrast-model.js')
    expect(fresh.getIncreaseContrast()).toBe(false)
  })

  test('changeIncreaseContrast flips the live flag, notifying once per change', async () => {
    const storage = createMemoryStorage()
    let notified = 0
    const unsubscribe = subscribeIncreaseContrast(() => {
      notified += 1
    })

    await changeIncreaseContrast(true, storage)
    expect(getIncreaseContrast()).toBe(true)
    expect(notified).toBe(1)

    // Same value → no notify (a redundant re-render of the whole theme tree).
    await changeIncreaseContrast(true, storage)
    expect(notified).toBe(1)

    await changeIncreaseContrast(false, storage)
    expect(getIncreaseContrast()).toBe(false)
    expect(notified).toBe(2)

    unsubscribe()
    await changeIncreaseContrast(true, storage)
    expect(notified).toBe(2)
  })
})

describe('persistence', () => {
  beforeEach(async () => {
    await changeIncreaseContrast(false, createMemoryStorage())
  })

  test('turning it on stores "true"', async () => {
    const storage = createMemoryStorage()

    await changeIncreaseContrast(true, storage)

    expect(await storage.prefs.get(PREF_INCREASE_CONTRAST)).toBe('true')
    expect(await readSavedIncreaseContrast(storage)).toBe(true)
  })

  test('turning it off removes the pref, so default and untouched are one state', async () => {
    const storage = createMemoryStorage()
    await changeIncreaseContrast(true, storage)

    await changeIncreaseContrast(false, storage)

    expect(await storage.prefs.get(PREF_INCREASE_CONTRAST)).toBeNull()
    expect(await readSavedIncreaseContrast(storage)).toBe(false)
  })

  test('applySavedIncreaseContrast replays the persisted flag at startup', async () => {
    const storage = createMemoryStorage()
    await storage.prefs.set(PREF_INCREASE_CONTRAST, 'true')

    expect(await applySavedIncreaseContrast(storage)).toBe(true)
    expect(getIncreaseContrast()).toBe(true)
  })

  test('nothing persisted leaves startup at off', async () => {
    const storage = createMemoryStorage()

    expect(await readSavedIncreaseContrast(storage)).toBe(false)
    expect(await applySavedIncreaseContrast(storage)).toBe(false)
    expect(getIncreaseContrast()).toBe(false)
  })

  test('an unreadable prefs store degrades to off instead of throwing', async () => {
    const storage = unreadableStorage()
    await changeIncreaseContrast(true, createMemoryStorage())

    // Both directions: the read and the live apply must not reject, and the
    // toggle must still work in-session even when it cannot persist.
    await expect(readSavedIncreaseContrast(storage)).resolves.toBe(false)
    await expect(applySavedIncreaseContrast(storage)).resolves.toBe(false)
    expect(getIncreaseContrast()).toBe(false)
    await expect(changeIncreaseContrast(true, storage)).resolves.toBe(true)
    expect(getIncreaseContrast()).toBe(true)
  })
})
