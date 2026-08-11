import { describe, expect, test } from 'vitest'

import {
  EXCLUDE_TABS,
  excludeTabLabelKey,
  filterDirNameSuggestions,
  relativeToRoot,
} from '../domain/exclude-dir-model.js'

describe('excludeTabLabelKey', () => {
  test('every tab has a distinct label key', () => {
    const keys = EXCLUDE_TABS.map(excludeTabLabelKey)
    expect(new Set(keys).size).toBe(EXCLUDE_TABS.length)
  })

  test('maps each tab to its i18n key', () => {
    expect(excludeTabLabelKey('name')).toBe('libops.excludeTabName')
    expect(excludeTabLabelKey('path')).toBe('libops.excludeTabPath')
    expect(excludeTabLabelKey('autoCreate')).toBe('libops.excludeTabAutoCreate')
  })
})

/** Mirrors the Flutter `Autocomplete.optionsBuilder` — see the doc comment. */
describe('filterDirNameSuggestions', () => {
  const names = ['Rock', 'rocket', 'jazz', 'Jazzy', 'blues']

  test('an empty query yields no suggestions', () => {
    expect(filterDirNameSuggestions(names, '', [])).toEqual([])
    expect(filterDirNameSuggestions(names, '   ', [])).toEqual([])
  })

  test('matches case-insensitively by substring', () => {
    expect(filterDirNameSuggestions(names, 'roc', [])).toEqual(['Rock', 'rocket'])
    expect(filterDirNameSuggestions(names, 'JAZZ', [])).toEqual(['jazz', 'Jazzy'])
  })

  test('already-excluded names are dropped', () => {
    expect(filterDirNameSuggestions(names, 'roc', ['Rock'])).toEqual(['rocket'])
  })

  test('results are capped at the limit', () => {
    const many = ['a1', 'a2', 'a3', 'a4']
    expect(filterDirNameSuggestions(many, 'a', [], 2)).toEqual(['a1', 'a2'])
  })

  test('no match yields an empty list, not a throw', () => {
    expect(filterDirNameSuggestions(names, 'xyz', [])).toEqual([])
  })
})

/** Mirrors Flutter's `path.startsWith(_musicPath) ? path.substring(...) : path`. */
describe('relativeToRoot', () => {
  test('strips the root and one leading separator', () => {
    expect(relativeToRoot('/music/rock/a.flac', '/music')).toBe('rock/a.flac')
  })

  test('a path equal to the root shows as "/"', () => {
    expect(relativeToRoot('/music', '/music')).toBe('/')
  })

  test('a path outside the root is returned unchanged', () => {
    expect(relativeToRoot('/other/rock', '/music')).toBe('/other/rock')
  })

  test('an empty root returns the path unchanged, never throws', () => {
    expect(relativeToRoot('/music/rock', '')).toBe('/music/rock')
  })

  test('a backslash separator is also stripped (Windows-style paths)', () => {
    expect(relativeToRoot('C:\\music\\rock', 'C:\\music')).toBe('rock')
  })
})
