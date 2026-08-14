import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import type { Song } from '../../../models/song.js'
import { getAudio } from '../../../native/index.js'
import type { MockSongloftAudio } from '../../../native/mock-audio.js'
import { resetLoadedSongForTests, usePlayerStore } from '../store/player-store.js'

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

/**
 * Batch 40: a failed load/stream retries with exponential backoff instead of
 * stopping dead. The delays are 1s / 3s / 9s, the budget is per-song, and the
 * retry re-seeks to where the failure happened.
 */
describe('playback error retry', () => {
  const mock = () => getAudio() as MockSongloftAudio

  test('retries after 1s and resumes from the failure position', async () => {
    await usePlayerStore.getState().playPlaylist([song(1, 300)], 0)
    await flush()
    vi.advanceTimersByTime(2_000) // play up to 2s in
    const loadSpy = vi.spyOn(getAudio(), 'load')
    const seekSpy = vi.spyOn(getAudio(), 'seek')

    mock().simulateError('502')
    expect(usePlayerStore.getState().errorMessage).toBe('502')
    expect(loadSpy).not.toHaveBeenCalled() // still waiting out the backoff

    vi.advanceTimersByTime(1_000)
    await flush()
    expect(loadSpy).toHaveBeenCalledTimes(1)
    expect(seekSpy).toHaveBeenCalledWith(2_000)
    // A retry in flight must not keep showing the old failure.
    expect(usePlayerStore.getState().errorMessage).toBeUndefined()

    loadSpy.mockRestore()
    seekSpy.mockRestore()
  })

  test('gives up after three attempts and leaves the error standing', async () => {
    await usePlayerStore.getState().playPlaylist([song(1, 300)], 0)
    await flush()
    const loadSpy = vi.spyOn(getAudio(), 'load')

    for (const delay of [1_000, 3_000, 9_000]) {
      mock().simulateError('502')
      vi.advanceTimersByTime(delay)
      await flush()
    }
    expect(loadSpy).toHaveBeenCalledTimes(3)

    // Fourth failure: the budget is spent, so nothing more is scheduled.
    mock().simulateError('502')
    vi.advanceTimersByTime(60_000)
    await flush()
    expect(loadSpy).toHaveBeenCalledTimes(3)
    expect(usePlayerStore.getState().errorMessage).toBe('502')

    loadSpy.mockRestore()
  })

  test('a pending retry is dropped when the user moves to another song', async () => {
    await usePlayerStore.getState().playPlaylist([song(1, 300), song(2, 300)], 0)
    await flush()

    mock().simulateError('502')
    await usePlayerStore.getState().playNext()
    await flush()
    const loadSpy = vi.spyOn(getAudio(), 'load')

    vi.advanceTimersByTime(30_000)
    await flush()
    // The retry must not yank playback back to song 1.
    expect(loadSpy).not.toHaveBeenCalled()
    expect(usePlayerStore.getState().currentSong?.id).toBe(2)

    loadSpy.mockRestore()
  })

  test('each song gets its own retry budget', async () => {
    await usePlayerStore.getState().playPlaylist([song(1, 300), song(2, 300)], 0)
    await flush()

    // Spend song 1's budget entirely.
    for (const delay of [1_000, 3_000, 9_000]) {
      mock().simulateError('502')
      vi.advanceTimersByTime(delay)
      await flush()
    }
    mock().simulateError('502')

    await usePlayerStore.getState().playNext()
    await flush()
    const loadSpy = vi.spyOn(getAudio(), 'load')

    mock().simulateError('502')
    vi.advanceTimersByTime(1_000)
    await flush()
    expect(loadSpy).toHaveBeenCalledTimes(1)

    loadSpy.mockRestore()
  })
})

/**
 * Batch 40: the native queue carries `artworkUrl` so the media notification and
 * lock screen can show the cover. The interesting part is not that the field is
 * copied but that it is **resolved** — the native side only `Uri.parse`s it, so
 * a bare `/api/v1/...` path (or one missing `access_token`) renders no artwork.
 */
describe('native queue metadata', () => {
  test('setQueue carries a resolved artwork URL, and omits it with no cover', async () => {
    const spy = vi.spyOn(getAudio(), 'setQueue')
    const withCover = { ...song(1, 30), coverUrl: '/api/v1/songs/1/cover' } as Song

    await usePlayerStore.getState().playPlaylist([withCover, song(2, 30)], 0)
    await flush()

    const items = spy.mock.calls[0]?.[0]
    expect(items?.[0]?.artworkUrl).toContain('/api/v1/songs/1/cover')
    expect(items?.[0]?.artworkUrl).toContain('access_token=')
    expect(items?.[1]?.artworkUrl).toBeUndefined()
    spy.mockRestore()
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

/**
 * A cold start with auto-resume OFF (the default) restores `currentSong` into the
 * store but deliberately does not hand it to the audio engine. `togglePlay` then
 * used to call `audio.play()` straight away — and both ExoPlayer and AVPlayer
 * treat `play()` with no media item as a silent no-op, so the mini player's play
 * button did nothing whatsoever, not even flip its icon.
 *
 * The mock is what hid this: its `play()` starts ticking without a prior
 * `load()`, so every existing test "passed" against an engine state that cannot
 * occur on a device. These tests assert the load happens.
 */
describe('togglePlay when the engine holds nothing (cold start, auto-resume off)', () => {
  test('loads the restored song instead of no-op playing', async () => {
    const audio = getAudio() as MockSongloftAudio
    const loadSpy = vi.spyOn(audio, 'load')
    // Exactly what restorePlaybackState leaves behind with autoResume=false.
    resetLoadedSongForTests()
    usePlayerStore.setState({
      playlist: [song(7, 300)],
      currentIndex: 0,
      currentSong: song(7, 300),
      currentTime: 42_000,
      isPlaying: false,
    })

    await usePlayerStore.getState().togglePlay()
    await flush()

    expect(loadSpy).toHaveBeenCalledTimes(1)
    expect(usePlayerStore.getState().isPlaying).toBe(true)
    loadSpy.mockRestore()
  })

  test('does not reload when the engine already holds the current song', async () => {
    const audio = getAudio() as MockSongloftAudio
    await usePlayerStore.getState().playPlaylist([song(1, 300)], 0)
    await flush()

    const loadSpy = vi.spyOn(audio, 'load')
    await usePlayerStore.getState().togglePlay() // pause
    await usePlayerStore.getState().togglePlay() // resume
    await flush()

    expect(loadSpy).not.toHaveBeenCalled()
    expect(usePlayerStore.getState().isPlaying).toBe(true)
    loadSpy.mockRestore()
  })
})
