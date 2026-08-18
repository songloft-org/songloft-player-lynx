import { describe, expect, test } from 'vitest'

import type { Playlist } from '../../../../models/playlist.js'
import {
  extractLeadingNumber,
  sortPlaylistsByName,
  sortPlaylistsByNumberPrefix,
} from '../playlist-sort.js'

function makePlaylist(id: number, name: string): Playlist {
  return {
    id,
    type: 'normal',
    name,
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
  }
}

describe('extractLeadingNumber', () => {
  test('extracts number from start', () => {
    expect(extractLeadingNumber('04.校园故事')).toBe(4)
    expect(extractLeadingNumber('12 - Track Name')).toBe(12)
  })

  test('extracts number from middle', () => {
    expect(extractLeadingNumber('干得漂亮 | 01 好意被辜负')).toBe(1)
  })

  test('returns null for no number', () => {
    expect(extractLeadingNumber('No Numbers Here')).toBeNull()
  })
})

describe('sortPlaylistsByName', () => {
  test('sorts ascending, case-insensitively', () => {
    const playlists = [makePlaylist(1, 'banana'), makePlaylist(2, 'Apple'), makePlaylist(3, 'cherry')]
    expect(sortPlaylistsByName(playlists, true)).toEqual([2, 1, 3])
  })

  test('sorts descending', () => {
    const playlists = [makePlaylist(1, 'banana'), makePlaylist(2, 'Apple'), makePlaylist(3, 'cherry')]
    expect(sortPlaylistsByName(playlists, false)).toEqual([3, 1, 2])
  })

  test('returns null when already sorted', () => {
    const playlists = [makePlaylist(1, 'Apple'), makePlaylist(2, 'banana'), makePlaylist(3, 'cherry')]
    expect(sortPlaylistsByName(playlists, true)).toBeNull()
  })

  test('does not sort by pinyin — plain codepoint order for CJK names', () => {
    const playlists = [makePlaylist(1, '张三'), makePlaylist(2, '李四')]
    // '张' (U+5F20) > '李' (U+674E) is false; codepoint order keeps original
    // relative order here regardless of pinyin (zh1 vs li3).
    expect(sortPlaylistsByName(playlists, true)).toBeNull()
  })
})

describe('sortPlaylistsByNumberPrefix', () => {
  test('numbered playlists sorted by number, before non-numbered', () => {
    const playlists = [
      makePlaylist(1, 'No Number'),
      makePlaylist(2, '03 Third'),
      makePlaylist(3, '01 First'),
      makePlaylist(4, '02 Second'),
    ]
    expect(sortPlaylistsByNumberPrefix(playlists)).toEqual([3, 4, 2, 1])
  })

  test('ties within same number broken by name', () => {
    const playlists = [makePlaylist(1, '01 Zebra'), makePlaylist(2, '01 Apple')]
    expect(sortPlaylistsByNumberPrefix(playlists)).toEqual([2, 1])
  })

  test('returns null when already sorted', () => {
    const playlists = [makePlaylist(1, '01 First'), makePlaylist(2, '02 Second')]
    expect(sortPlaylistsByNumberPrefix(playlists)).toBeNull()
  })
})
