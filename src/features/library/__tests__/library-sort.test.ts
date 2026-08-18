import { describe, expect, test } from 'vitest'

import { en } from '../../../i18n/resources.js'
import {
  coerceLibrarySortId,
  DEFAULT_LIBRARY_SORT_ID,
  LIBRARY_SORT_OPTIONS,
  librarySortFilters,
} from '../domain/library-sort.js'

/**
 * The backend's `songOrderWhitelist`, copied from
 * `internal/database/filters.go`. A sort field outside this list is silently
 * replaced with `added_at DESC` server-side — which is exactly how the old
 * `sort=random` view masqueraded as "recent". The membership test below is
 * the gate against reintroducing that class of bug.
 */
const SONG_ORDER_WHITELIST = new Set([
  'id', 'title', 'artist', 'album', 'duration',
  'added_at', 'updated_at', 'file_modified_at', 'year', 'genre',
])

describe('LIBRARY_SORT_OPTIONS', () => {
  test('every field is inside the backend songOrderWhitelist', () => {
    for (const option of LIBRARY_SORT_OPTIONS) {
      expect(SONG_ORDER_WHITELIST.has(option.field), `${option.field} must be whitelisted`).toBe(true)
    }
  })

  test('ids are unique and directions are bound to fields', () => {
    const ids = LIBRARY_SORT_OPTIONS.map((o) => o.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(librarySortFilters('added_at')).toEqual({ sort: 'added_at', order: 'desc' })
    expect(librarySortFilters('file_modified_at')).toEqual({ sort: 'file_modified_at', order: 'desc' })
    expect(librarySortFilters('title')).toEqual({ sort: 'title', order: 'asc' })
    expect(librarySortFilters('artist')).toEqual({ sort: 'artist', order: 'asc' })
    expect(librarySortFilters('album')).toEqual({ sort: 'album', order: 'asc' })
    expect(librarySortFilters('year')).toEqual({ sort: 'year', order: 'desc' })
    expect(librarySortFilters('duration')).toEqual({ sort: 'duration', order: 'asc' })
  })

  test('the default id is one of the options', () => {
    expect(LIBRARY_SORT_OPTIONS.some((o) => o.id === DEFAULT_LIBRARY_SORT_ID)).toBe(true)
  })

  /** Dynamic-key i18n gate — see the note in library-views.test.ts. */
  test('every label key resolves to a non-empty English string', () => {
    const lookup = (path: string): unknown =>
      path.split('.').reduce<unknown>((node, part) =>
        node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined, en)
    for (const { labelKey } of LIBRARY_SORT_OPTIONS) {
      const value = lookup(labelKey)
      expect(typeof value === 'string' && value.length > 0, `${labelKey} must resolve`).toBe(true)
    }
  })
})

describe('coerceLibrarySortId', () => {
  test('accepts every known id', () => {
    for (const option of LIBRARY_SORT_OPTIONS) {
      expect(coerceLibrarySortId(option.id)).toBe(option.id)
    }
  })

  test('rejects junk and the old invented values', () => {
    for (const raw of [null, undefined, '', 'random', 'genre', 'ADDED_AT']) {
      expect(coerceLibrarySortId(raw)).toBe(DEFAULT_LIBRARY_SORT_ID)
    }
  })
})
