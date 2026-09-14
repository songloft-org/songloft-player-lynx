import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import type { Song } from '../../../models/song.js'
import { resetVideoModuleForTests } from '../../../native/video.js'

/**
 * `video-open.ts` is the one place that answers "can this song be watched here" and
 * "put it on screen, then tell me what happened". Both are asserted here at the
 * module boundary, with the *store* mocked: what matters is which question got asked
 * and how the answer is reported — the store's own video-source switching is
 * `player-store.test.ts`'s job.
 *
 * The entry-point predicate is worth this much attention because getting it wrong is
 * invisible: the badge that shipped twice as a tappable no-op (Web, and a build
 * without the host module) looked identical to a working one.
 */
const store = vi.hoisted(() => ({ enterVideoSource: vi.fn(async () => 'skipped') }))
vi.mock('../store/index.js', () => ({
  usePlayerStore: { getState: () => store },
}))

const { canWatchVideo, openCurrentSongVideo } = await import('../data/video-open.js')

const g = globalThis as Record<string, unknown>

interface HostOptions {
  /**
   * What `open` answers. Booleans mirror old hosts (`false` = no video track); new
   * hosts answer a reason string, of which `'failed'` is the "stream would not load"
   * case this suite must keep distinct from `'noTrack'`.
   */
  opens?: boolean | 'opened' | 'noTrack' | 'failed'
  /** What `isOpen` answers — a surface that is already up. */
  alreadyOpen?: boolean
}

function installHost(options: HostOptions = {}): { open: ReturnType<typeof vi.fn> } {
  const open = vi.fn((_args: string, cb: (json: string) => void) =>
    cb(JSON.stringify({ result: options.opens ?? true })))
  g.NativeModules = {
    SongloftVideo: {
      open,
      close: (_a: string, cb: (json: string) => void) => cb('{}'),
      isOpen: (_a: string, cb: (json: string) => void) =>
        cb(JSON.stringify({ result: options.alreadyOpen ?? false })),
    },
  }
  resetVideoModuleForTests()
  return { open }
}

function videoSong(overrides: Partial<Song> = {}): Song {
  return {
    id: 1,
    type: 'local',
    title: 'Blue in Green',
    year: 0,
    duration: 300,
    fileSize: 0,
    bitRate: 0,
    sampleRate: 0,
    isLive: false,
    isVideo: true,
    format: 'mp4',
    url: '/api/v1/songs/1/play',
    addedAt: '',
    updatedAt: '',
    ...overrides,
  } as Song
}

beforeEach(() => {
  store.enterVideoSource.mockClear()
  store.enterVideoSource.mockResolvedValue('skipped')
})

afterEach(() => {
  delete g.NativeModules
  delete g.SystemInfo
  resetVideoModuleForTests()
})

describe('canWatchVideo', () => {
  test('false for a song with no picture, and for no song at all', () => {
    g.SystemInfo = { platform: 'iOS' }
    installHost()
    expect(canWatchVideo(null)).toBe(false)
    expect(canWatchVideo(undefined)).toBe(false)
    expect(canWatchVideo(videoSong({ isVideo: false }))).toBe(false)
  })

  /*
   * The two hosts that have no video surface. Web would otherwise pass every other
   * check — the song is a video song and the container is playable there — which is
   * exactly how the badge came to be tappable on Web and do nothing.
   */
  test('false where the host has no video module (HarmonyOS, or a stale shell)', () => {
    g.SystemInfo = { platform: 'iOS' }
    delete g.NativeModules
    resetVideoModuleForTests()
    expect(canWatchVideo(videoSong())).toBe(false)
  })

  test('true on Web once the host registers SongloftVideo', () => {
    g.SystemInfo = { platform: 'web' }
    installHost()
    expect(canWatchVideo(videoSong())).toBe(true)
  })

  /* `/video-hls` works off a file, and a live stream has none. */
  test('false for a live stream, including a radio wearing isVideo', () => {
    g.SystemInfo = { platform: 'Android' }
    installHost()
    expect(canWatchVideo(videoSong({ isLive: true }))).toBe(false)
    expect(canWatchVideo(videoSong({ type: 'radio', isLive: true }))).toBe(false)
  })

  test('true when the picture is already in the stream, and when it needs a transcode', () => {
    g.SystemInfo = { platform: 'Android' }
    installHost()
    // mp4 is direct on both platforms; mkv is direct on Android but transcoded on iOS.
    expect(canWatchVideo(videoSong({ format: 'mp4' }))).toBe(true)
    expect(canWatchVideo(videoSong({ format: 'mkv' }))).toBe(true)
  })
})

describe('openCurrentSongVideo', () => {
  test('an already-open surface is left alone (no second controller, no reload)', async () => {
    g.SystemInfo = { platform: 'iOS' }
    const { open } = installHost({ alreadyOpen: true })
    await expect(openCurrentSongVideo()).resolves.toBe('opened')
    expect(open).not.toHaveBeenCalled()
    expect(store.enterVideoSource).not.toHaveBeenCalled()
  })

  test('a failed transcode is reported as such, and the surface is not opened', async () => {
    g.SystemInfo = { platform: 'iOS' }
    const { open } = installHost()
    store.enterVideoSource.mockResolvedValue('failed')
    await expect(openCurrentSongVideo()).resolves.toBe('transcodeFailed')
    // A black rectangle over the library would be worse than the honest message.
    expect(open).not.toHaveBeenCalled()
  })

  test('a switched source opens the surface', async () => {
    g.SystemInfo = { platform: 'iOS' }
    const { open } = installHost()
    store.enterVideoSource.mockResolvedValue('switched')
    await expect(openCurrentSongVideo()).resolves.toBe('opened')
    expect(open).toHaveBeenCalledTimes(1)
  })

  /*
   * The host refusing `open` is not a failure to report as an error — the song is
   * playing and simply has no picture (a remote song served from a `-vn` cache entry).
   * It has to be a distinct outcome: it used to be reported as a transcode failure.
   */
  test('the host finding no video track is its own outcome', async () => {
    g.SystemInfo = { platform: 'Android' }
    installHost({ opens: false })
    await expect(openCurrentSongVideo()).resolves.toBe('noTrack')
  })

  /*
   * The flip side of the `-vn` case: the song *has* a picture but the host could not
   * load the stream (transcode refused, HLS playlist 404). The host sees the item
   * fail and says `'failed'`; reporting that as "no video track" is the lie this
   * whole function exists to avoid.
   */
  test("a stream the host could not load is a failed transcode, not 'noTrack'", async () => {
    g.SystemInfo = { platform: 'iOS' }
    installHost({ opens: 'failed' })
    await expect(openCurrentSongVideo()).resolves.toBe('transcodeFailed')
  })
})
