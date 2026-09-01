import { describe, expect, test } from 'vitest'

import { createMemoryStorage } from '../../../core/storage/index.js'
import {
  PREF_LIBRARY_SORT,
  PREF_LIBRARY_SORT_ORDER,
  readLibrarySort,
  writeLibrarySort,
} from '../data/library-sort-prefs.js'

describe('library sort prefs round-trip', () => {
  test('reads the default, then reflects a written value', async () => {
    const storage = createMemoryStorage()
    expect(await readLibrarySort(storage)).toEqual({ id: 'added_at', order: 'desc' })
    await writeLibrarySort('title', 'asc', storage)
    expect(await storage.prefs.get(PREF_LIBRARY_SORT)).toBe('title')
    expect(await storage.prefs.get(PREF_LIBRARY_SORT_ORDER)).toBe('asc')
    expect(await readLibrarySort(storage)).toEqual({ id: 'title', order: 'asc' })
  })

  test('persists a flipped direction', async () => {
    const storage = createMemoryStorage()
    await writeLibrarySort('added_at', 'asc', storage)
    expect(await readLibrarySort(storage)).toEqual({ id: 'added_at', order: 'asc' })
  })

  test('a corrupt persisted value coerces back to the default', async () => {
    const storage = createMemoryStorage()
    // 'random' is exactly the value the pre-refactor client used to send —
    // it must never survive a round-trip into the query params.
    await storage.prefs.set(PREF_LIBRARY_SORT, 'random')
    expect(await readLibrarySort(storage)).toEqual({ id: 'added_at', order: 'desc' })
  })

  test('missing order falls back to the field default', async () => {
    const storage = createMemoryStorage()
    await storage.prefs.set(PREF_LIBRARY_SORT, 'title')
    expect(await readLibrarySort(storage)).toEqual({ id: 'title', order: 'asc' })
  })
})
