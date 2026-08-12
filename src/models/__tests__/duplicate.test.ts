import { describe, expect, test } from 'vitest'

import {
  parseDuplicatesResult,
  parseBatchDeleteResponse,
} from '../duplicate.js'

describe('parseDuplicatesResult', () => {
  test('parses a complete response with groups', () => {
    const result = parseDuplicatesResult({
      groups: [
        {
          fingerprint: 'abc123',
          songs: [
            {
              id: 1,
              title: 'Song A',
              artist: 'Artist',
              album: 'Album',
              duration: 240,
              file_path: '/m/song-a.flac',
              format: 'flac',
              bit_rate: 320,
              file_size: 30_000_000,
              cover_url: null,
              added_at: '2024-01-01',
            },
            {
              id: 2,
              title: 'Song A',
              artist: 'Artist',
              album: 'Album',
              duration: 240,
              file_path: '/m/song-a.mp3',
              format: 'mp3',
              bit_rate: 192,
              file_size: 8_000_000,
            },
          ],
        },
      ],
      total_groups: 1,
      total_duplicates: 2,
    })

    expect(result.totalGroups).toBe(1)
    expect(result.totalDuplicates).toBe(2)
    expect(result.groups).toHaveLength(1)
    expect(result.groups[0].fingerprint).toBe('abc123')
    expect(result.groups[0].songs).toHaveLength(2)

    const song1 = result.groups[0].songs[0]
    expect(song1.id).toBe(1)
    expect(song1.title).toBe('Song A')
    expect(song1.filePath).toBe('/m/song-a.flac')
    expect(song1.bitRate).toBe(320)
    expect(song1.fileSize).toBe(30_000_000)
    expect(song1.fileSizeDisplay).toBe('28.6 MB')

    const song2 = result.groups[0].songs[1]
    expect(song2.format).toBe('mp3')
    expect(song2.bitRate).toBe(192)
    expect(song2.fileSizeDisplay).toBe('7.6 MB')
  })

  test('falls back on empty/missing data', () => {
    const result = parseDuplicatesResult({})
    expect(result.groups).toEqual([])
    expect(result.totalGroups).toBe(0)
    expect(result.totalDuplicates).toBe(0)
  })

  test('handles null songs array in a group', () => {
    const result = parseDuplicatesResult({
      groups: [{ fingerprint: 'x', songs: null }],
      total_groups: 1,
      total_duplicates: 0,
    })
    expect(result.groups[0].songs).toEqual([])
  })

  test('fileSizeDisplay formats KB correctly', () => {
    const result = parseDuplicatesResult({
      groups: [{
        fingerprint: 'fp',
        songs: [{ id: 1, file_size: 2048 }],
      }],
      total_groups: 1,
      total_duplicates: 1,
    })
    expect(result.groups[0].songs[0].fileSizeDisplay).toBe('2.0 KB')
  })

  test('fileSizeDisplay formats 0 bytes', () => {
    const result = parseDuplicatesResult({
      groups: [{ fingerprint: 'fp', songs: [{ id: 1, file_size: 0 }] }],
      total_groups: 1,
      total_duplicates: 1,
    })
    expect(result.groups[0].songs[0].fileSizeDisplay).toBe('0 B')
  })
})

describe('parseBatchDeleteResponse', () => {
  test('parses deleted count', () => {
    expect(parseBatchDeleteResponse({ deleted: 5 })).toEqual({ deleted: 5 })
  })

  test('falls back to 0 on missing field', () => {
    expect(parseBatchDeleteResponse({})).toEqual({ deleted: 0 })
  })
})
