import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import type { Song } from '../../../models/song.js'
import { getAudio } from '../../../native/index.js'
import type { MockSongloftAudio } from '../../../native/mock-audio.js'
import { resetVideoModuleForTests } from '../../../native/video.js'
import { resetLoadedSongForTests, restorePlaybackState, usePlayerStore } from '../store/player-store.js'

/**
 * Player-store ↔ mock-audio bridge. Uses the real singleton store + mock audio
 * with fake timers: the mock's `setInterval` progress drives `currentTime`, and
 * `completed` routes through the store's play-mode logic.
 *
 * The lyric store is mocked to a spy bag because these tests assert *whether*
 * lyrics were asked for — how a payload parses is lyric-store.test.ts's job.
 * `player-store` only ever touches `useLyricStore.getState()`, so that is the
 * whole mock.
 */
const lyricStore = vi.hoisted(() => ({
  loadForSong: vi.fn(async () => {}),
  clear: vi.fn(),
  syncPosition: vi.fn(),
}))
vi.mock('../store/lyric-store.js', () => ({
  useLyricStore: { getState: () => lyricStore },
}))

/** What `loadPlaybackState` answers in this file (null = nothing persisted). */
const playback = vi.hoisted(() => ({
  saved: null as null | { playlist: Song[]; currentIndex: number; positionMs: number },
}))
vi.mock('../data/playback-persistence.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  loadPlaybackState: () => Promise.resolve(playback.saved),
}))

/** Auto-resume pref, switchable per test (off by default, like the real pref). */
const prefs = vi.hoisted(() => ({ autoResume: false }))
vi.mock('../../settings/data/settings-prefs.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  readAutoResume: () => Promise.resolve(prefs.autoResume),
  readPlaybackSpeed: () => Promise.resolve(1),
}))

/**
 * Device-cache lookup, controllable per test. `null` = not cached (the default, so
 * the rest of this file behaves as before); set it to a `file://` URL to simulate a
 * song already saved on device. Only `getCachedPath` is overridden — the source of
 * truth the store resolves playback through.
 */
const songCache = vi.hoisted(() => ({ cachedPath: null as string | null }))
vi.mock('../data/song-cache.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getCachedPath: () => Promise.resolve(songCache.cachedPath),
}))

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

/**
 * Flush pending microtasks (async load/play chain in `playAtIndex`).
 *
 * Several ticks, not one: the playback paths resolve the source cache-aware
 * (`resolvePlaybackSource` → `getCachedPath`) before loading, and the retry path
 * chains a `.then` on top, so the load settles a few microtasks after the timer
 * that triggered it.
 */
async function flush(): Promise<void> {
  for (let i = 0; i < 8; i++) await Promise.resolve()
}

beforeEach(() => {
  vi.useFakeTimers()
  usePlayerStore.getState().reset()
  resetLoadedSongForTests()
  playback.saved = null
  prefs.autoResume = false
  songCache.cachedPath = null
  lyricStore.loadForSong.mockClear()
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

  test('a progress event with an unknown duration keeps the known one', async () => {
    await usePlayerStore.getState().playPlaylist([song(1, 30)], 0)
    await flush()
    expect(usePlayerStore.getState().duration).toBe(30_000)

    // What AVPlayer reports for the first moment of a remote track. Position must
    // still land; the duration must not be blanked.
    ;(getAudio() as MockSongloftAudio).simulateUnknownDurationProgress(1_234)

    expect(usePlayerStore.getState().currentTime).toBe(1_234)
    expect(usePlayerStore.getState().duration).toBe(30_000)
  })

  test('a track change updates the duration without waiting for the host', async () => {
    await usePlayerStore.getState().playPlaylist([song(1, 30), song(2, 90)], 0)
    await flush()
    expect(usePlayerStore.getState().duration).toBe(30_000)

    // The mock is *handed* the duration by `load` and echoes it back synchronously,
    // which no real host can do — AVPlayer has to parse the container first, and
    // reports 0 until it has. Stub `load` silent to reproduce that: the store must
    // then have the new duration from the song metadata alone, or the seek bar stays
    // sized to the previous track until the host catches up.
    const loadSpy = vi.spyOn(getAudio(), 'load').mockResolvedValue(undefined)
    try {
      void usePlayerStore.getState().playNext()

      expect(usePlayerStore.getState().currentSong?.id).toBe(2)
      expect(usePlayerStore.getState().duration).toBe(90_000)
    } finally {
      loadSpy.mockRestore()
    }
    await flush()
  })
})

describe('playAll start index by play mode', () => {
  const fiveSongs = () => [song(1, 30), song(2, 30), song(3, 30), song(4, 30), song(5, 30)]

  test('random mode starts on a random track, not always the first', async () => {
    const rand = vi.spyOn(Math, 'random').mockReturnValue(0.5) // floor(0.5 * 5) = 2
    try {
      usePlayerStore.getState().setPlayMode('random')
      await usePlayerStore.getState().playAll(fiveSongs())
      await flush()
      expect(usePlayerStore.getState().currentIndex).toBe(2)
      expect(usePlayerStore.getState().currentSong?.id).toBe(3)
    } finally {
      rand.mockRestore()
    }
  })

  test('non-random modes start at the first track', async () => {
    usePlayerStore.getState().setPlayMode('order')
    await usePlayerStore.getState().playAll(fiveSongs())
    await flush()
    expect(usePlayerStore.getState().currentIndex).toBe(0)
    expect(usePlayerStore.getState().currentSong?.id).toBe(1)
  })

  test('playPlaylist(…, 0) stays exact even in random mode (play-all vs single tap)', async () => {
    // The strict distinction: an explicit index 0 (a tap on the first song) must
    // NOT be randomised — only the `playAll` action consults the play mode.
    const rand = vi.spyOn(Math, 'random').mockReturnValue(0.5)
    try {
      usePlayerStore.getState().setPlayMode('random')
      await usePlayerStore.getState().playPlaylist(fiveSongs(), 0)
      await flush()
      expect(usePlayerStore.getState().currentIndex).toBe(0)
      expect(usePlayerStore.getState().currentSong?.id).toBe(1)
    } finally {
      rand.mockRestore()
    }
  })

  test('playAll on an empty queue is a no-op', async () => {
    usePlayerStore.getState().setPlayMode('random')
    await usePlayerStore.getState().playAll([])
    await flush()
    expect(usePlayerStore.getState().currentSong).toBeUndefined()
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
 * The native engines key their media-notification / lock-screen metadata by the
 * exact URL they are asked to load (`metadataByUrl`). If the queue metadata were
 * built from the remote URL while a cached song loaded a `file://` URL, the lookup
 * would miss and the lock screen would show no title/artist/artwork. This pins the
 * invariant that prevents that: whatever URL `load` receives must be one of the
 * URLs `setQueue` registered.
 */
describe('queue metadata matches the loaded URL', () => {
  test('a cached song loads the same file:// URL the queue metadata carries', async () => {
    songCache.cachedPath = 'file:///cache/1.mp3'
    const loadSpy = vi.spyOn(getAudio(), 'load')
    const setQueueSpy = vi.spyOn(getAudio(), 'setQueue')

    await usePlayerStore.getState().playPlaylist([song(1, 300)], 0)
    await flush()

    const loadedUrl = loadSpy.mock.calls[0]?.[0]
    const queueUrls = setQueueSpy.mock.calls.flatMap(
      (call) => (call[0] as { url: string }[]).map((item) => item.url),
    )
    expect(loadedUrl).toBe('file:///cache/1.mp3')
    expect(queueUrls).toContain(loadedUrl)

    loadSpy.mockRestore()
    setQueueSpy.mockRestore()
  })

  test('an uncached song loads the remote URL the queue metadata carries', async () => {
    const loadSpy = vi.spyOn(getAudio(), 'load')
    const setQueueSpy = vi.spyOn(getAudio(), 'setQueue')

    // A playable URL so `songUrl` resolves to something non-empty.
    const withUrl = { ...song(1, 300), url: '/api/v1/songs/1/play' } as Song
    await usePlayerStore.getState().playPlaylist([withUrl], 0)
    await flush()

    const loadedUrl = loadSpy.mock.calls[0]?.[0]
    const queueUrls = setQueueSpy.mock.calls.flatMap(
      (call) => (call[0] as { url: string }[]).map((item) => item.url),
    )
    expect(loadedUrl).toBeTruthy()
    expect(queueUrls).toContain(loadedUrl)

    loadSpy.mockRestore()
    setQueueSpy.mockRestore()
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

/**
 * Lyrics follow `currentSong` via a store subscription — the Lynx analogue of
 * Flutter's reactive `lyricStateProvider`. The load used to live only inside
 * `playAtIndex`, so a song restored from the persisted queue played over an
 * EMPTY lyric store: "playing but no lyrics". These tests pin the subscription
 * itself (any setter triggers it) plus the restore path end to end.
 */
describe('lyrics follow the current song', () => {
  test('a song set by any path loads lyrics — the restore path included', () => {
    const restored = song(9, 300)
    // Exactly what restorePlaybackState leaves behind with autoResume=false.
    usePlayerStore.setState({ currentSong: restored })

    expect(lyricStore.loadForSong).toHaveBeenCalledWith(restored)
  })

  test('the same reference does not re-load; a different song does', () => {
    const a = song(1, 300)
    usePlayerStore.setState({ currentSong: a })
    usePlayerStore.setState({ currentSong: a })
    expect(lyricStore.loadForSong).toHaveBeenCalledTimes(1)

    usePlayerStore.setState({ currentSong: song(2, 300) })
    expect(lyricStore.loadForSong).toHaveBeenCalledTimes(2)
  })

  test('clearing the song resets lyrics through the same subscription', () => {
    usePlayerStore.setState({ currentSong: song(1, 300) })

    usePlayerStore.setState({ currentSong: undefined })

    expect(lyricStore.loadForSong).toHaveBeenCalledWith(undefined)
  })

  test('playPlaylist loads lyrics via the subscription', async () => {
    await usePlayerStore.getState().playPlaylist([song(1, 300)], 0)
    await flush()

    expect(lyricStore.loadForSong).toHaveBeenCalledWith(usePlayerStore.getState().currentSong)
  })
})

describe('restorePlaybackState', () => {
  test('auto-resume loads the restored song once; togglePlay resumes without reloading', async () => {
    playback.saved = {
      playlist: [{ ...song(7, 300), url: '/api/v1/songs/7/play' }],
      currentIndex: 0,
      positionMs: 42_000,
    }
    prefs.autoResume = true

    const loadSpy = vi.spyOn(getAudio(), 'load')
    await restorePlaybackState()
    await flush()

    // Lyrics follow the restored song — the bug this whole describe pins.
    expect(lyricStore.loadForSong).toHaveBeenCalledWith(playback.saved.playlist[0])
    expect(loadSpy).toHaveBeenCalledTimes(1)

    // Pause then resume: the engine already holds the song, so no reload.
    // Without `_loadedSongId` being set after the resume load, this togglePlay
    // re-ran the full playAtIndex load.
    await usePlayerStore.getState().togglePlay()
    await usePlayerStore.getState().togglePlay()
    await flush()
    expect(loadSpy).toHaveBeenCalledTimes(1)
    loadSpy.mockRestore()
  })

  test('with auto-resume off the state is restored and lyrics still load', async () => {
    playback.saved = { playlist: [song(8, 300)], currentIndex: 0, positionMs: 0 }
    prefs.autoResume = false

    await restorePlaybackState()

    expect(usePlayerStore.getState().currentSong?.id).toBe(8)
    expect(lyricStore.loadForSong).toHaveBeenCalledWith(usePlayerStore.getState().currentSong)
  })
})

/**
 * The URL handed to the engine is the only place the transcode decision becomes
 * observable, and it was wrong on every device: `songUrl()` passed no `platform`, so
 * `getTranscodeFormat` fell back to its `'web'` default. A video song therefore
 * arrived with `?format=mp3` — the client asking the server to run `-vn` and drop
 * the picture.
 *
 * `SystemInfo` is injected directly because that is what `getPlatformTarget()` reads,
 * and it is present in both Lynx realms (see `platform-target.ts`).
 */
describe('playback URL carries the real platform', () => {
  const g = globalThis as Record<string, unknown>

  async function urlFor(format: string, platform: string, isVideo = false): Promise<string> {
    g.SystemInfo = { platform }
    // The store skips `load` when the engine already holds that song id, and
    // `_loadedSongId` survives `reset()`. Without this the spy records nothing and
    // every assertion below passes against an empty string.
    resetLoadedSongForTests()
    const loadSpy = vi.spyOn(getAudio(), 'load').mockResolvedValue(undefined)
    const track = { ...song(1, 300), url: '/api/v1/songs/1/play', format, isVideo } as Song
    await usePlayerStore.getState().playPlaylist([track], 0)
    await flush()
    const url = (loadSpy.mock.calls[0]?.[0] as string | undefined) ?? ''
    loadSpy.mockRestore()
    delete g.SystemInfo
    expect(url, 'nothing reached the engine, so the real assertion would be vacuous')
      .toContain('/api/v1/songs/1/play')
    return url
  }

  test('iOS gets ogg transcoded, which is what makes it playable at all', async () => {
    expect(await urlFor('ogg', 'iOS')).toContain('format=mp3')
  })

  test('an MP4-container video song is not asked to strip its picture', async () => {
    // mp4 normalises to 'm4a', which every platform set holds, so this URL was
    // already clean. Pinned because it is the container the first video songs use.
    expect(await urlFor('mp4', 'Android', true)).not.toContain('format=')
  })

  test('Android keeps transcoding containers whose codecs are not guaranteed', async () => {
    expect(await urlFor('mkv', 'Android')).toContain('format=mp3')
  })

  test('with no host the URL stays the old, safe one', async () => {
    expect(await urlFor('aiff', 'web')).toContain('format=mp3')
  })
})

/**
 * Which stream a video song opens with. The picture has to be in the stream from the
 * start for attaching a surface to be instant — swapping the source when the user
 * taps fullscreen would cost a reload and a seek, which is exactly the interruption
 * that reusing one player instance is supposed to avoid.
 */
describe('video songs open the video stream', () => {
  const g = globalThis as Record<string, unknown>

  async function loadCallFor(
    format: string,
    platform: string,
    prime?: () => Promise<unknown>,
  ): Promise<{ url: string; hls: boolean | undefined }> {
    g.SystemInfo = { platform }
    resetLoadedSongForTests()
    const loadSpy = vi.spyOn(getAudio(), 'load').mockResolvedValue(undefined)
    const track = {
      ...song(1, 300),
      url: '/api/v1/songs/1/play',
      format,
      isVideo: true,
    } as Song
    await usePlayerStore.getState().playPlaylist([track], 0)
    await flush()
    if (prime) {
      loadSpy.mockClear()
      await prime()
      await flush()
    }
    const call = loadSpy.mock.calls[0]
    loadSpy.mockRestore()
    delete g.SystemInfo
    expect(call, 'nothing reached the engine, so the assertions below would be vacuous')
      .toBeDefined()
    return {
      url: (call?.[0] as string) ?? '',
      hls: (call?.[1] as { hls?: boolean } | undefined)?.hls,
    }
  }

  test('a directly playable container asks for media=video, not a transcode', async () => {
    const { url, hls } = await loadCallFor('mp4', 'Android')
    expect(url).toContain('media=video')
    expect(url).not.toContain('format=')
    expect(hls).toBe(false)
  })

  test('mkv is direct on Android but not on iOS', async () => {
    expect((await loadCallFor('mkv', 'Android')).url).toContain('media=video')
    // AVFoundation cannot demux Matroska, so iOS keeps the audio stream until the
    // user actually asks for the picture — `/video-hls/` transcodes the whole file
    // before it answers, which is not something to pay for by default.
    const ios = await loadCallFor('mkv', 'iOS')
    expect(ios.url).not.toContain('media=video')
    expect(ios.url).not.toContain('video-hls')
  })

  test('enterVideoSource switches iOS to the transcoded playlist, with hls set', async () => {
    const { url, hls } = await loadCallFor('mkv', 'iOS', () =>
      usePlayerStore.getState().enterVideoSource(),
    )
    expect(url).toContain('/video-hls/playlist.m3u8')
    // The token query means the URL does not end in `.m3u8`, so the engine's
    // extension sniff cannot see it — the flag is the only thing that works.
    expect(url.endsWith('.m3u8')).toBe(false)
    expect(hls).toBe(true)
  })

  test('a retry after enterVideoSource keeps the video stream', async () => {
    // Without `_videoSourceSongId` the retry would quietly reload the audio URL and
    // the picture would vanish mid-playback, looking like a server hiccup.
    g.SystemInfo = { platform: 'iOS' }
    resetLoadedSongForTests()
    const track = {
      ...song(1, 300), url: '/api/v1/songs/1/play', format: 'mkv', isVideo: true,
    } as Song
    await usePlayerStore.getState().playPlaylist([track], 0)
    await flush()
    await usePlayerStore.getState().enterVideoSource()
    await flush()

    const loadSpy = vi.spyOn(getAudio(), 'load').mockResolvedValue(undefined)
    ;(getAudio() as MockSongloftAudio).simulateError('502')
    vi.advanceTimersByTime(1_000)
    await flush()
    expect(loadSpy.mock.calls[0]?.[0] as string).toContain('/video-hls/')
    loadSpy.mockRestore()
    delete g.SystemInfo
  })

  test('enterVideoSource is a no-op for a container that already carries video', async () => {
    g.SystemInfo = { platform: 'Android' }
    resetLoadedSongForTests()
    const track = {
      ...song(1, 300), url: '/api/v1/songs/1/play', format: 'mp4', isVideo: true,
    } as Song
    await usePlayerStore.getState().playPlaylist([track], 0)
    await flush()
    const loadSpy = vi.spyOn(getAudio(), 'load').mockResolvedValue(undefined)
    await usePlayerStore.getState().enterVideoSource()
    await flush()
    expect(loadSpy).not.toHaveBeenCalled()
    loadSpy.mockRestore()
    delete g.SystemInfo
  })
})

/**
 * A fullscreen video surface is lent to the *player*, not to a song, so the queue
 * moving on leaves whatever was drawn last still on screen. Reported from the device
 * as "the MV finished and I was left on a black screen"; the fix is the
 * `currentSong` subscription in player-store.ts, exercised here through the store
 * (the subscription is what a page-level effect cannot cover: auto-advance fires it
 * while the Lynx page is behind the native surface).
 */
describe('the fullscreen video surface follows the queue', () => {
  const g = globalThis as Record<string, unknown>

  /** The host bag the store will find when it reaches for `SongloftVideo`. */
  function installVideoHost(): { close: ReturnType<typeof vi.fn> } {
    const close = vi.fn((_args: string, cb: (json: string) => void) => cb('{}'))
    g.NativeModules = {
      SongloftVideo: {
        open: (_a: string, cb: (json: string) => void) => cb('{"result":true}'),
        close,
        isOpen: (_a: string, cb: (json: string) => void) => cb('{"result":false}'),
        setSurfaceLayout: (_a: string, cb: (json: string) => void) => cb('{}'),
        setOrientation: (_a: string, cb: (json: string) => void) => cb('{}'),
        getVideoSize: (_a: string, cb: (json: string) => void) => cb('{}'),
      },
    }
    resetVideoModuleForTests()
    return { close }
  }

  function videoSong(id: number): Song {
    return { ...song(id, 300), url: `/api/v1/songs/${id}/play`, format: 'mp4', isVideo: true } as Song
  }

  afterEach(() => {
    delete g.NativeModules
    delete g.SystemInfo
    resetVideoModuleForTests()
  })

  test('moving to the next song closes it', async () => {
    g.SystemInfo = { platform: 'iOS' }
    const { close } = installVideoHost()
    resetLoadedSongForTests()

    await usePlayerStore.getState().playPlaylist([videoSong(1), song(2)], 0)
    await flush()
    expect(close).not.toHaveBeenCalled()

    await usePlayerStore.getState().playNext()
    await flush()
    expect(close).toHaveBeenCalledTimes(1)
  })

  test('clearing the queue closes it too (nothing left to draw)', async () => {
    g.SystemInfo = { platform: 'Android' }
    const { close } = installVideoHost()
    resetLoadedSongForTests()

    await usePlayerStore.getState().playPlaylist([videoSong(1)], 0)
    await flush()
    usePlayerStore.getState().clearPlaylist()
    await flush()
    expect(close).toHaveBeenCalledTimes(1)
  })

  /*
   * The guard that keeps this from becoming a bridge call on every track change: a
   * song that could never have been watched cannot have left a surface up. Without
   * it, `close()` runs for every audio track the user skips past.
   */
  test('an audio-only song change never reaches the host', async () => {
    g.SystemInfo = { platform: 'iOS' }
    const { close } = installVideoHost()
    resetLoadedSongForTests()

    await usePlayerStore.getState().playPlaylist([song(1), song(2)], 0)
    await flush()
    await usePlayerStore.getState().playNext()
    await flush()
    expect(close).not.toHaveBeenCalled()
  })

  test('on Web the surface is closed on track change, same as device hosts', async () => {
    g.SystemInfo = { platform: 'web' }
    const { close } = installVideoHost()
    resetLoadedSongForTests()

    await usePlayerStore.getState().playPlaylist([videoSong(1), song(2)], 0)
    await flush()
    await usePlayerStore.getState().playNext()
    await flush()
    expect(close).toHaveBeenCalledTimes(1)
  })
})

describe('HLS radio source flag', () => {
  /**
   * The native engines choose HlsMediaSource on `hls || url.endsWith(".m3u8")`.
   * The suffix half can never fire because `songUrl()` appends `?access_token=…`,
   * so the store has to set the flag — otherwise a live playlist is opened as a
   * progressive stream and does not play at all.
   *
   * URL shapes below are what a live backend returned: an `.m3u8` upstream keeps
   * the extension, an mp3 / icecast upstream does not.
   */
  function radio(id: number, url: string): Song {
    return { ...song(id, 0), type: 'radio', isLive: true, url, format: '' } as Song
  }

  test('an HLS radio is loaded with hls: true', async () => {
    await usePlayerStore.getState().playPlaylist([radio(73, '/api/v1/songs/73/play.m3u8')], 0)
    await flush()
    const mock = getAudio() as MockSongloftAudio
    expect(mock.lastLoad?.opts?.hls).toBe(true)
    // The suffix check the engines do on their own is genuinely useless here.
    expect(mock.lastLoad?.url.endsWith('.m3u8')).toBe(false)
  })

  test('a progressive radio is NOT flagged as HLS', async () => {
    // Handing HlsMediaSource an mp3/icecast stream would break playback that works.
    await usePlayerStore.getState().playPlaylist([radio(74, '/api/v1/songs/74/play')], 0)
    await flush()
    expect((getAudio() as MockSongloftAudio).lastLoad?.opts?.hls).toBe(false)
  })

  test('a normal local song is NOT flagged as HLS', async () => {
    await usePlayerStore.getState().playPlaylist([{ ...song(1, 30), url: '/api/v1/songs/1/play' } as Song], 0)
    await flush()
    expect((getAudio() as MockSongloftAudio).lastLoad?.opts?.hls).toBe(false)
  })
})

describe('background queue fill (songloft-player-lynx#9)', () => {
  test('addToPlaylist dedups against the queue by (id, type)', async () => {
    await usePlayerStore.getState().playPlaylist([song(1, 30), song(2, 30)], 0)
    // Second `song(2)` is a duplicate within the incoming batch itself.
    usePlayerStore.getState().addToPlaylist([song(2), song(2), song(3)])
    expect(usePlayerStore.getState().playlist.map((s) => s.id)).toEqual([1, 2, 3])
  })

  test('addToPlaylist keeps a same-id song of a different type', async () => {
    await usePlayerStore.getState().playPlaylist([song(1, 30)], 0)
    usePlayerStore.getState().addToPlaylist([{ ...song(1, 30), type: 'remote' } as Song])
    expect(usePlayerStore.getState().playlist.map((s) => `${s.id}:${s.type}`))
      .toEqual(['1:local', '1:remote'])
  })

  test('loadRemainingSongsForCurrentPlaylist appends fetched batches', async () => {
    await usePlayerStore.getState().playPlaylist([song(1, 30), song(2, 30)], 0)
    const fetch = vi.fn(async (offset: number, limit: number): Promise<Song[]> => {
      const batch: Song[] = []
      for (let i = offset; i < Math.min(offset + limit, 5); i++) batch.push(song(i + 1))
      return batch
    })

    usePlayerStore.getState().loadRemainingSongsForCurrentPlaylist({
      loadedCount: 2,
      total: 5,
      fetch,
    })
    await flush()

    // First request continues exactly where the loaded pages stopped, at the
    // loader's batch size — the whole point of the background fill.
    expect(fetch.mock.calls[0]).toEqual([2, 100])
    expect(usePlayerStore.getState().playlist.map((s) => s.id)).toEqual([1, 2, 3, 4, 5])
  })

  test('loadRemainingSongsForCurrentPlaylist is a no-op when nothing remains', async () => {
    await usePlayerStore.getState().playPlaylist([song(1, 30)], 0)
    const fetch = vi.fn(async (): Promise<Song[]> => [])
    usePlayerStore.getState().loadRemainingSongsForCurrentPlaylist({
      loadedCount: 1,
      total: 1,
      fetch,
    })
    await flush()
    expect(fetch).not.toHaveBeenCalled()
  })

  test('starting new playback cancels an in-flight fill', async () => {
    await usePlayerStore.getState().playPlaylist([song(1, 30), song(2, 30)], 0)
    let release: (songs: Song[]) => void = () => {}
    const fetch = vi.fn(() => new Promise<Song[]>((res) => { release = res }))

    usePlayerStore.getState().loadRemainingSongsForCurrentPlaylist({
      loadedCount: 2,
      total: 100,
      fetch,
    })

    // The user starts something else while the first batch is in flight…
    await usePlayerStore.getState().playPlaylist([song(9, 30)], 0)
    // …and that batch lands anyway. The generation check must drop it.
    release([song(3)])
    await flush()

    expect(usePlayerStore.getState().playlist.map((s) => s.id)).toEqual([9])
  })

  test('clearing the queue cancels an in-flight fill', async () => {
    await usePlayerStore.getState().playPlaylist([song(1, 30), song(2, 30)], 0)
    let release: (songs: Song[]) => void = () => {}
    const fetch = vi.fn(() => new Promise<Song[]>((res) => { release = res }))

    usePlayerStore.getState().loadRemainingSongsForCurrentPlaylist({
      loadedCount: 2,
      total: 100,
      fetch,
    })

    usePlayerStore.getState().clearPlaylist()
    release([song(3)])
    await flush()

    expect(usePlayerStore.getState().playlist).toEqual([])
  })
})
