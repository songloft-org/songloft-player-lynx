import { describe, expect, test, vi } from 'vitest'

import type { SongloftStorage } from '../../../core/storage/types.js'
import {
  DEFAULT_LOCAL_CACHE_MAX_SIZE,
  PREF_LOCAL_CACHE_MAX_SIZE,
  readLocalCacheMaxSize,
  writeLocalCacheMaxSize,
} from '../data/song-cache-prefs.js'

/** A `SongloftStorage` whose prefs hold a single configurable value. */
function fakeStorage(stored: string | null, throwOnGet = false): SongloftStorage {
  const set = vi.fn(async () => {})
  return {
    prefs: {
      get: vi.fn(async () => {
        if (throwOnGet) throw new Error('boom')
        return stored
      }),
      set,
      remove: vi.fn(async () => {}),
      keys: vi.fn(async () => []),
    },
    secure: { get: vi.fn(), set: vi.fn(), remove: vi.fn() },
    paths: { appData: vi.fn(), cache: vi.fn(), documents: vi.fn() },
  } as unknown as SongloftStorage
}

describe('readLocalCacheMaxSize', () => {
  test('defaults to 1 GiB when nothing is stored', async () => {
    expect(await readLocalCacheMaxSize(fakeStorage(null))).toBe(DEFAULT_LOCAL_CACHE_MAX_SIZE)
    expect(DEFAULT_LOCAL_CACHE_MAX_SIZE).toBe(1073741824)
  })

  test('reads back a stored byte count', async () => {
    expect(await readLocalCacheMaxSize(fakeStorage('536870912'))).toBe(536870912)
  })

  test('falls back to the default on dirty values', async () => {
    for (const dirty of ['', 'abc', '-5', '0', 'NaN']) {
      expect(await readLocalCacheMaxSize(fakeStorage(dirty))).toBe(DEFAULT_LOCAL_CACHE_MAX_SIZE)
    }
  })

  test('falls back to the default when storage throws', async () => {
    expect(await readLocalCacheMaxSize(fakeStorage(null, true))).toBe(DEFAULT_LOCAL_CACHE_MAX_SIZE)
  })
})

describe('writeLocalCacheMaxSize', () => {
  test('stores the value as a string under the prefs key', async () => {
    const storage = fakeStorage(null)
    await writeLocalCacheMaxSize(2147483648, storage)
    expect(storage.prefs.set).toHaveBeenCalledWith(PREF_LOCAL_CACHE_MAX_SIZE, '2147483648')
  })

  test('swallows storage failures (best-effort)', async () => {
    const storage = fakeStorage(null)
    ;(storage.prefs.set as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('boom'))
    await expect(writeLocalCacheMaxSize(1024, storage)).resolves.toBeUndefined()
  })
})
