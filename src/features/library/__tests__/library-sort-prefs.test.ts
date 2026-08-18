import { describe, expect, test } from 'vitest'

import { createMemoryStorage } from '../../../core/storage/index.js'
import {
  PREF_LIBRARY_SORT,
  readLibrarySort,
  writeLibrarySort,
} from '../data/library-sort-prefs.js'

describe('library sort prefs round-trip', () => {
  test('reads the default, then reflects a written value', async () => {
    const storage = createMemoryStorage()
    expect(await readLibrarySort(storage)).toBe('added_at')
    await writeLibrarySort('title', storage)
    expect(await storage.prefs.get(PREF_LIBRARY_SORT)).toBe('title')
    expect(await readLibrarySort(storage)).toBe('title')
  })

  test('a corrupt persisted value coerces back to the default', async () => {
    const storage = createMemoryStorage()
    // 'random' is exactly the value the pre-refactor client used to send —
    // it must never survive a round-trip into the query params.
    await storage.prefs.set(PREF_LIBRARY_SORT, 'random')
    expect(await readLibrarySort(storage)).toBe('added_at')
  })
})
