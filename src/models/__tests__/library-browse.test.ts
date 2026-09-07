import { describe, expect, test } from 'vitest'

import {
  DEFAULT_LIBRARY_BROWSE_CONFIG,
  isLibraryViewKey,
  LIBRARY_VIEW_KEYS,
  parseLibraryBrowseConfig,
} from '../library-browse.js'

/**
 * The backend's 18 legal keys, copied verbatim from
 * `internal/handlers/library_browse_setting.go` (`libraryViewKeys`). The test
 * below pins our copy to this list; if the backend grows a key, update BOTH
 * sides of the comparison deliberately.
 */
const BACKEND_VIEW_KEYS = [
  'all', 'local', 'remote', 'radio',
  'folder', 'artist', 'album', 'genre', 'year', 'decade', 'language', 'style',
  'tag',
  'playlist', 'playlist_normal', 'playlist_radio', 'playlist_remote', 'playlist_local',
]

function keysOf(config: ReturnType<typeof parseLibraryBrowseConfig>): string[] {
  return config.views.map((v) => v.key)
}

describe('LIBRARY_VIEW_KEYS', () => {
  test('matches the backend whitelist exactly, including order', () => {
    expect([...LIBRARY_VIEW_KEYS]).toEqual(BACKEND_VIEW_KEYS)
  })

  test('isLibraryViewKey accepts exactly the 18 keys', () => {
    for (const key of BACKEND_VIEW_KEYS) expect(isLibraryViewKey(key)).toBe(true)
    for (const key of ['recent', 'favorites', 'random', '', 'ALL']) {
      expect(isLibraryViewKey(key)).toBe(false)
    }
  })
})

describe('DEFAULT_LIBRARY_BROWSE_CONFIG', () => {
  test('is all 18 views visible in backend default order', () => {
    expect(keysOf(DEFAULT_LIBRARY_BROWSE_CONFIG)).toEqual(BACKEND_VIEW_KEYS)
    expect(DEFAULT_LIBRARY_BROWSE_CONFIG.views.every((v) => v.visible)).toBe(true)
  })
})

describe('parseLibraryBrowseConfig', () => {
  test('passes a complete valid config through, order and visibility intact', () => {
    // User reordered: playlists group first, `remote` hidden.
    const views = [
      { key: 'playlist_radio', visible: true },
      { key: 'playlist_normal', visible: true },
      { key: 'playlist', visible: true },
      { key: 'playlist_remote', visible: true },
      { key: 'playlist_local', visible: true },
      { key: 'all', visible: true },
      { key: 'local', visible: true },
      { key: 'remote', visible: false },
      { key: 'radio', visible: true },
      { key: 'folder', visible: true },
      { key: 'artist', visible: true },
      { key: 'album', visible: true },
      { key: 'genre', visible: true },
      { key: 'year', visible: true },
      { key: 'decade', visible: true },
      { key: 'language', visible: true },
      { key: 'style', visible: true },
      { key: 'tag', visible: true },
    ]
    const parsed = parseLibraryBrowseConfig({ views })
    expect(keysOf(parsed)).toEqual(views.map((v) => v.key))
    expect(parsed.views.find((v) => v.key === 'remote')?.visible).toBe(false)
  })

  test('drops unknown keys (the old client sent id/order junk here)', () => {
    const parsed = parseLibraryBrowseConfig({
      views: [
        { key: 'recent', visible: true },
        { key: 'all', visible: true },
        { key: 'random', visible: false },
      ],
    })
    expect(keysOf(parsed).slice(0, 1)).toEqual(['all'])
    expect(keysOf(parsed)).not.toContain('recent')
    expect(keysOf(parsed)).not.toContain('random')
    // Missing keys are appended visible, in backend default order.
    expect(keysOf(parsed)).toHaveLength(18)
    expect(keysOf(parsed).slice(1)).toEqual(BACKEND_VIEW_KEYS.filter((k) => k !== 'all'))
  })

  test('deduplicates keys, keeping the first occurrence', () => {
    const parsed = parseLibraryBrowseConfig({
      views: [
        { key: 'all', visible: false },
        { key: 'all', visible: true },
      ],
    })
    const all = parsed.views.filter((v) => v.key === 'all')
    expect(all).toHaveLength(1)
    expect(all[0]!.visible).toBe(false)
  })

  test('missing visible defaults to true (Flutter parity)', () => {
    const parsed = parseLibraryBrowseConfig({ views: [{ key: 'all' }] })
    expect(parsed.views.find((v) => v.key === 'all')?.visible).toBe(true)
  })

  test('garbage payloads never throw and yield the full default (AGENTS §2)', () => {
    for (const garbage of [null, undefined, '', 42, 'views', { views: 'nope' }, { views: [42, null, 'x'] }]) {
      const parsed = parseLibraryBrowseConfig(garbage)
      expect(keysOf(parsed)).toEqual(BACKEND_VIEW_KEYS)
      expect(parsed.views.every((v) => v.visible)).toBe(true)
    }
  })

  test('non-object view entries are skipped, not fatal', () => {
    const parsed = parseLibraryBrowseConfig({
      views: [{ key: 'artist', visible: false }, null, 7, { key: 'album', visible: true }],
    })
    expect(parsed.views.find((v) => v.key === 'artist')?.visible).toBe(false)
    expect(parsed.views.find((v) => v.key === 'album')?.visible).toBe(true)
    expect(keysOf(parsed)).toHaveLength(18)
  })
})
