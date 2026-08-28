import { describe, expect, test } from 'vitest'

import type { Playlist } from '../../../../models/playlist.js'
import { playlistRowMenuKeys } from '../playlist-row-menu.js'

function makePlaylist(over: Partial<Playlist> = {}): Playlist {
  return {
    id: 1,
    type: 'normal',
    name: 'Playlist',
    description: undefined,
    coverUrl: undefined,
    labels: [],
    songCount: 0,
    sortBy: 'position',
    sortOrder: 'asc',
    createdAt: '',
    updatedAt: '',
    isBuiltIn: false,
    isAutoCreated: false,
    isHidden: false,
    pinnedAt: undefined,
    isPinned: false,
    ...over,
  }
}

describe('playlistRowMenuKeys', () => {
  test('a normal playlist gets pin, convertToTag, edit, visibility, delete', () => {
    expect(playlistRowMenuKeys(makePlaylist())).toEqual([
      'pin',
      'convertToTag',
      'edit',
      'visibility',
      'delete',
    ])
  })

  test('a built-in playlist keeps only pin', () => {
    expect(playlistRowMenuKeys(makePlaylist({ isBuiltIn: true }))).toEqual(['pin'])
  })

  test('pin is always first so it leads the menu in both cases', () => {
    expect(playlistRowMenuKeys(makePlaylist())[0]).toBe('pin')
    expect(playlistRowMenuKeys(makePlaylist({ isBuiltIn: true }))[0]).toBe('pin')
  })
})
