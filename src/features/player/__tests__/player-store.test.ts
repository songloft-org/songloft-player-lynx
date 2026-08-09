import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import type { Song } from '../../../models/song.js'
import { usePlayerStore } from '../store/player-store.js'

/**
 * Player-store ↔ mock-audio bridge. Uses the real singleton store + mock audio
 * with fake timers: the mock's `setInterval` progress drives `currentTime`, and
 * `completed` routes through the store's play-mode logic. Songs carry no
 * `lyricUrl`, so the lyric loader short-circuits (no network).
 */

function song(id: number, durationSec = 1): Song {
  return {
    id,
    type: 'local',
    title: `Song ${id}`,
    year: 0,
    duration: durationSec,
    fileSize: 0,
    bitRate: 0,
    sampleRate: 0,
    isLive: false,
    isVideo: false,
    addedAt: '',
    updatedAt: '',
  } as Song
}

/** Flush pending microtasks (async load/play chain in `playAtIndex`). */
async function flush(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
}

beforeEach(() => {
  vi.useFakeTimers()
  usePlayerStore.getState().reset()
})

afterEach(() => {
  usePlayerStore.getState().reset()
  vi.useRealTimers()
})

describe('playback + progress', () => {
  test('playPlaylist starts playback and progress advances currentTime', async () => {
    await usePlayerStore.getState().playPlaylist([song(1, 30), song(2, 30)], 0)
    await flush()

    expect(usePlayerStore.getState().isPlaying).toBe(true)
    expect(usePlayerStore.getState().currentSong?.id).toBe(1)
    expect(usePlayerStore.getState().duration).toBe(30_000)

    vi.advanceTimersByTime(500) // 2 ticks
    expect(usePlayerStore.getState().currentTime).toBe(500)
  })

  test('seekBy clamps within [0, duration]', async () => {
    await usePlayerStore.getState().playPlaylist([song(1, 10)], 0)
    await flush()
    await usePlayerStore.getState().seekBy(-9_999)
    expect(usePlayerStore.getState().currentTime).toBe(0)
    await usePlayerStore.getState().seekBy(999_999)
    expect(usePlayerStore.getState().currentTime).toBe(10_000)
  })
})

describe('completion routing by play mode', () => {
  test('order advances to the next track', async () => {
    await usePlayerStore.getState().playPlaylist([song(1, 1), song(2, 1)], 0)
    await flush()
    vi.advanceTimersByTime(1_000) // song 1 completes
    await flush()
    expect(usePlayerStore.getState().currentIndex).toBe(1)
    expect(usePlayerStore.getState().currentSong?.id).toBe(2)
    expect(usePlayerStore.getState().isPlaying).toBe(true)
  })

  test('order at the end stops (no wrap)', async () => {
    await usePlayerStore.getState().playPlaylist([song(1, 1)], 0)
    await flush()
    vi.advanceTimersByTime(1_000)
    await flush()
    expect(usePlayerStore.getState().currentIndex).toBe(0)
    expect(usePlayerStore.getState().isPlaying).toBe(false)
  })

  test('loop wraps from the last track to the first', async () => {
    usePlayerStore.getState().setPlayMode('loop')
    await usePlayerStore.getState().playPlaylist([song(1, 1), song(2, 1)], 1)
    await flush()
    vi.advanceTimersByTime(1_000)
    await flush()
    expect(usePlayerStore.getState().currentIndex).toBe(0)
    expect(usePlayerStore.getState().isPlaying).toBe(true)
  })

  test('single repeats the same track', async () => {
    usePlayerStore.getState().setPlayMode('single')
    await usePlayerStore.getState().playPlaylist([song(1, 1), song(2, 1)], 0)
    await flush()
    vi.advanceTimersByTime(1_000)
    await flush()
    expect(usePlayerStore.getState().currentIndex).toBe(0)
    expect(usePlayerStore.getState().isPlaying).toBe(true)
  })

  test('afterSongs sleep timer pauses when it expires on completion', async () => {
    await usePlayerStore.getState().playPlaylist([song(1, 1), song(2, 1)], 0)
    await flush()
    usePlayerStore.getState().setSleepTimerAfterSongs(1)
    vi.advanceTimersByTime(1_000) // song 1 completes → timer expires
    await flush()
    expect(usePlayerStore.getState().isPlaying).toBe(false)
    expect(usePlayerStore.getState().sleepTimer).toBeUndefined()
    // Did not advance to the next track.
    expect(usePlayerStore.getState().currentIndex).toBe(0)
  })
})

describe('volume + mute', () => {
  test('setVolume clamps to 0..100', async () => {
    await usePlayerStore.getState().setVolume(140)
    expect(usePlayerStore.getState().volume).toBe(100)
    await usePlayerStore.getState().setVolume(-5)
    expect(usePlayerStore.getState().volume).toBe(0)
  })

  test('toggleMute remembers and restores the previous volume', async () => {
    await usePlayerStore.getState().setVolume(40)
    await usePlayerStore.getState().toggleMute()
    expect(usePlayerStore.getState().volume).toBe(0)
    expect(usePlayerStore.getState().previousVolume).toBe(40)
    await usePlayerStore.getState().toggleMute()
    expect(usePlayerStore.getState().volume).toBe(40)
  })
})

describe('duration sleep timer countdown', () => {
  test('counts down each second and pauses on expiry', async () => {
    await usePlayerStore.getState().playPlaylist([song(1, 300)], 0)
    await flush()
    usePlayerStore.getState().setSleepTimerByDuration(2_000)
    vi.advanceTimersByTime(1_000)
    expect(usePlayerStore.getState().sleepTimer?.remainingMs).toBe(1_000)
    vi.advanceTimersByTime(1_000)
    await flush()
    expect(usePlayerStore.getState().sleepTimer).toBeUndefined()
    expect(usePlayerStore.getState().isPlaying).toBe(false)
  })
})
