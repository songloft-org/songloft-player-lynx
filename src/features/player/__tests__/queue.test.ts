import { describe, expect, test } from 'vitest'

import type { Song } from '../../../models/song.js'
import { moveItem, removeAt, reorder } from '../domain/queue.js'

function song(id: number): Song {
  return {
    id,
    type: 'local',
    title: `Song ${id}`,
    year: 0,
    duration: 0,
    fileSize: 0,
    bitRate: 0,
    sampleRate: 0,
    isLive: false,
    isVideo: false,
    addedAt: '',
    updatedAt: '',
  } as Song
}

const list = () => [song(1), song(2), song(3), song(4)]

describe('removeAt', () => {
  test('removing before current shifts the current index down', () => {
    const r = removeAt(list(), 2, 0)
    expect(r.playlist.map((s) => s.id)).toEqual([2, 3, 4])
    expect(r.currentIndex).toBe(1)
    expect(r.currentSong?.id).toBe(3)
    expect(r.removedCurrent).toBe(false)
    expect(r.shouldStop).toBe(false)
  })

  test('removing after current keeps the current index', () => {
    const r = removeAt(list(), 1, 3)
    expect(r.currentIndex).toBe(1)
    expect(r.currentSong?.id).toBe(2)
  })

  test('removing the current track points at the song that shifts in', () => {
    const r = removeAt(list(), 1, 1)
    expect(r.playlist.map((s) => s.id)).toEqual([1, 3, 4])
    expect(r.currentIndex).toBe(1)
    expect(r.currentSong?.id).toBe(3)
    expect(r.removedCurrent).toBe(true)
  })

  test('removing the last (current) track clamps to the new last index', () => {
    const r = removeAt(list(), 3, 3)
    expect(r.currentIndex).toBe(2)
    expect(r.currentSong?.id).toBe(3)
  })

  test('removing the only track stops playback', () => {
    const r = removeAt([song(1)], 0, 0)
    expect(r.playlist).toEqual([])
    expect(r.currentIndex).toBe(-1)
    expect(r.currentSong).toBeUndefined()
    expect(r.shouldStop).toBe(true)
  })

  test('out-of-range index is a no-op', () => {
    const r = removeAt(list(), 1, 9)
    expect(r.playlist.map((s) => s.id)).toEqual([1, 2, 3, 4])
    expect(r.currentIndex).toBe(1)
  })
})

describe('moveItem', () => {
  test('keeps the current track pinned when it moves', () => {
    const r = moveItem(list(), 0, 0, 2) // move current (id1) to index 2
    expect(r.playlist.map((s) => s.id)).toEqual([2, 3, 1, 4])
    expect(r.currentIndex).toBe(2)
    expect(r.currentSong?.id).toBe(1)
  })

  test('adjusts the current index when another item moves across it', () => {
    const r = moveItem(list(), 2, 0, 3) // move id1 past current (id3)
    expect(r.playlist.map((s) => s.id)).toEqual([2, 3, 4, 1])
    expect(r.currentIndex).toBe(1)
    expect(r.currentSong?.id).toBe(3)
  })

  test('no-op when from === to', () => {
    const r = moveItem(list(), 1, 2, 2)
    expect(r.playlist.map((s) => s.id)).toEqual([1, 2, 3, 4])
  })
})

test('reorder applies classic onReorder (pre-removal target) semantics', () => {
  // Drag id1 (index 0) to slot 3 (pre-removal) → lands at index 2.
  const r = reorder(list(), 0, 0, 3)
  expect(r.playlist.map((s) => s.id)).toEqual([2, 3, 1, 4])
  expect(r.currentIndex).toBe(2)
})
