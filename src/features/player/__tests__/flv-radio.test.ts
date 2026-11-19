import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { songSchema } from '../../../models/song.js'
import { getAudio } from '../../../native/index.js'
import type { MockSongloftAudio } from '../../../native/mock-audio.js'
import type { AudioEvent } from '../../../native/audio-types.js'
import type { RadioHlsSession } from '../data/radio-hls-api.js'
import { usePlayerStore } from '../store/player-store.js'

const radioHls = vi.hoisted(() => ({ create: vi.fn<(songId: number, signal: AbortSignal) => Promise<RadioHlsSession>>() }))
vi.mock('../data/radio-hls-api.js', () => ({ createRadioHlsSession: radioHls.create }))
vi.mock('../store/lyric-store.js', () => ({
  useLyricStore: { getState: () => ({ loadForSong() {}, clear() {}, syncPosition() {} }) },
}))

async function flush(): Promise<void> {
  for (let i = 0; i < 8; i++) await Promise.resolve()
}

beforeEach(() => {
  vi.useFakeTimers()
  radioHls.create.mockReset()
  vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response('{}'))
})

afterEach(() => {
  usePlayerStore.getState().reset()
  delete (globalThis as Record<string, unknown>).SystemInfo
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('HTTP-FLV radio compatibility', () => {
  const g = globalThis as Record<string, unknown>
  const radio = songSchema.parse({
    id: 579, title: 'FLV radio', duration: 3600, type: 'radio', is_live: true,
    is_video: true, url: '/api/v1/songs/579/play.flv',
  })
  const replacement = songSchema.parse({ id: 580, title: 'Next song', duration: 60, url: '/api/v1/songs/580/play' })
  const playlistUrl = '/api/v1/proxy/transcode/hls/sessions/example/playlist.m3u8?access_token=x'
  const audio = () => getAudio() as MockSongloftAudio
  const emit = (code: string) => (audio() as unknown as { emit: (event: AudioEvent) => void }).emit({ type: 'error', code, message: code })

  test('Android plays the raw FLV and does not create a session for the queue', async () => {
    g.SystemInfo = { platform: 'android' }
    await usePlayerStore.getState().playPlaylist([radio, replacement])
    expect(audio().lastLoad?.url).toContain('/play.flv?')
    expect(audio().lastLoad?.opts?.hls).toBe(false)
    expect(radioHls.create).not.toHaveBeenCalled()
  })

  test('iOS requests one HLS session and closes it on the next station', async () => {
    g.SystemInfo = { platform: 'ios' }
    const close = vi.fn(async () => {})
    radioHls.create.mockResolvedValue({ playbackUrl: () => playlistUrl, close })
    await usePlayerStore.getState().playPlaylist([radio, replacement])
    expect(radioHls.create).toHaveBeenCalledTimes(1)
    expect(audio().lastLoad).toMatchObject({ url: playlistUrl, opts: { hls: true } })
    await usePlayerStore.getState().playNext()
    expect(close).toHaveBeenCalledTimes(1)
    expect(audio().lastLoad?.url).toContain('/580/play')
  })

  test('Web retries FLV network errors and switches once on an explicit capability error', async () => {
    g.SystemInfo = { platform: 'web' }
    radioHls.create.mockResolvedValue({ playbackUrl: () => playlistUrl, close: async () => {} })
    await usePlayerStore.getState().playPlaylist([radio])
    emit('flv_stream_error')
    await vi.advanceTimersByTimeAsync(1_100)
    expect(audio().lastLoad?.url).toContain('/play.flv?')
    expect(radioHls.create).not.toHaveBeenCalled()
    emit('flv_needs_hls')
    await vi.advanceTimersByTimeAsync(3_100)
    expect(radioHls.create).toHaveBeenCalledTimes(1)
    expect(audio().lastLoad).toMatchObject({ url: playlistUrl, opts: { hls: true } })
    emit('flv_needs_hls')
    await vi.advanceTimersByTimeAsync(10_000)
    expect(radioHls.create).toHaveBeenCalledTimes(1)
  })

  test('a late native response is discarded and closed after switching songs', async () => {
    g.SystemInfo = { platform: 'ios' }
    let finish!: (session: RadioHlsSession) => void
    radioHls.create.mockImplementation(() => new Promise(resolve => { finish = resolve }))
    const start = usePlayerStore.getState().playPlaylist([radio, replacement])
    await flush()
    const signal = radioHls.create.mock.calls[0][1]
    await usePlayerStore.getState().playNext()
    expect(signal.aborted).toBe(true)
    const close = vi.fn(async () => {})
    finish({ playbackUrl: () => playlistUrl, close })
    await start
    expect(close).toHaveBeenCalledTimes(1)
    expect(audio().lastLoad?.url).toContain('/580/play')
  })
})
