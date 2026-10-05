import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import type { Song } from '../../../models/song.js'
import { getAudio } from '../../../native/index.js'
import { pollPlayback, useDlnaStore } from '../store/dlna-store.js'
import { usePlayerStore } from '../store/player-store.js'

const dlna = vi.hoisted(() => ({
  available: true,
  cast: vi.fn(async (_options: unknown) => { }),
  control: vi.fn(async (_action: string, _options?: unknown) => { }),
  getPlaybackState: vi.fn(async (_deviceId: string) => ({ state: 'PLAYING', positionMs: 5000, durationMs: 60000 })),
}))
vi.mock('../../../native/dlna.js', () => ({ getDlnaModule: () => dlna }))
vi.mock('../store/lyric-store.js', () => ({
  useLyricStore: { getState: () => ({ loadForSong: vi.fn(), syncPosition: vi.fn(), clear: vi.fn() }) },
}))
vi.mock('../../library/api/index.js', () => ({ getSongsApi: () => ({ recordPlayed: vi.fn(async () => { }) }) }))
const device = { id: 'speaker', name: '音箱', location: 'http://192.168.2.2/desc.xml' }
const song = (id: number) => ({
  id, type: 'local', title: `歌曲 ${id}`, duration: 60, format: 'mp3', url: `/api/v1/songs/${id}/play`,
  isLive: false, isVideo: false,
}) as Song

beforeEach(async () => {
  vi.useFakeTimers()
  await useDlnaStore.getState().disconnect()
  usePlayerStore.getState().reset()
  vi.clearAllMocks()
  dlna.getPlaybackState.mockResolvedValue({ state: 'PLAYING', positionMs: 5000, durationMs: 60000 })
  usePlayerStore.setState({ currentSong: song(1), playlist: [song(1), song(2)], currentIndex: 0 })
})
afterEach(async () => {
  await useDlnaStore.getState().disconnect()
  usePlayerStore.getState().reset()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

test('successful casting survives leaving the page and main controls pause/resume the selected renderer', async () => {
  await useDlnaStore.getState().castTo(device, song(1))
  expect(useDlnaStore.getState().activeDevice).toEqual(device)
  expect(usePlayerStore.getState().isPlaying).toBe(true)
  const localPlay = vi.spyOn(getAudio(), 'play')
  await usePlayerStore.getState().togglePlay()
  expect(dlna.control).toHaveBeenLastCalledWith('pause', { deviceId: device.id, value: undefined })
  expect(usePlayerStore.getState().isPlaying).toBe(false)
  await usePlayerStore.getState().togglePlay()
  expect(dlna.control).toHaveBeenLastCalledWith('play', { deviceId: device.id, value: undefined })
  expect(localPlay).not.toHaveBeenCalled()
})

test('next/previous change the remote URI without starting local audio', async () => {
  await useDlnaStore.getState().castTo(device, song(1))
  const localLoad = vi.spyOn(getAudio(), 'load')
  await usePlayerStore.getState().playNext()
  expect(dlna.cast).toHaveBeenLastCalledWith(expect.objectContaining({ deviceId: device.id, title: '歌曲 2', mimeType: 'audio/mpeg', url: expect.stringContaining('/songs/2/play') }))
  await usePlayerStore.getState().playPrev()
  expect(usePlayerStore.getState().currentSong?.id).toBe(1)
  expect(localLoad).not.toHaveBeenCalled()
})

test('seek, volume and progress use the remote renderer, ignoring old local progress', async () => {
  await useDlnaStore.getState().castTo(device, song(1))
  await pollPlayback()
  expect(usePlayerStore.getState().currentTime).toBe(5000)
  await usePlayerStore.getState().seekBy(3000)
  expect(dlna.control).toHaveBeenLastCalledWith('seek', { deviceId: device.id, value: 8 })
  await usePlayerStore.getState().setVolume(40)
  expect(dlna.control).toHaveBeenLastCalledWith('volume', { deviceId: device.id, value: 40 })
  expect(usePlayerStore.getState().volume).toBe(40)
})

test('remote completion advances the queue once; pause does not advance it', async () => {
  await useDlnaStore.getState().castTo(device, song(1))
  await pollPlayback()
  await usePlayerStore.getState().togglePlay()
  dlna.getPlaybackState.mockResolvedValue({ state: 'PAUSED_PLAYBACK', positionMs: 5000, durationMs: 60000 })
  await pollPlayback()
  expect(usePlayerStore.getState().currentSong?.id).toBe(1)
  await usePlayerStore.getState().togglePlay()
  dlna.getPlaybackState.mockResolvedValue({ state: 'PLAYING', positionMs: 59000, durationMs: 60000 })
  await pollPlayback()
  dlna.getPlaybackState.mockResolvedValue({ state: 'STOPPED', positionMs: 60000, durationMs: 60000 })
  await pollPlayback()
  for (let i = 0;i < 15;i++) await Promise.resolve()
  expect(usePlayerStore.getState().currentSong?.id).toBe(2)
  expect(dlna.cast).toHaveBeenCalledTimes(2)
})

test('failed URI is shown and leaves local audio alone', async () => {
  const pauseLocal = vi.spyOn(getAudio(), 'pause')
  dlna.cast.mockRejectedValueOnce(new Error('UPnP 714'))
  await expect(useDlnaStore.getState().castTo(device, song(1))).rejects.toThrow('714')
  expect(useDlnaStore.getState().activeDevice).toBeNull()
  expect(useDlnaStore.getState().error).toContain('714')
  expect(pauseLocal).not.toHaveBeenCalled()
})

test('disconnect stops the selected device and restores local controls', async () => {
  await useDlnaStore.getState().castTo(device, song(1))
  await useDlnaStore.getState().disconnect()
  expect(dlna.control).toHaveBeenLastCalledWith('stop', { deviceId: device.id })
  expect(useDlnaStore.getState().activeDevice).toBeNull()
  expect(usePlayerStore.getState().isPlaying).toBe(false)
  const localLoad = vi.spyOn(getAudio(), 'load')
  await usePlayerStore.getState().togglePlay()
  expect(localLoad).toHaveBeenCalled()
})

test('rapid pause/resume commands preserve user order', async () => {
  await useDlnaStore.getState().castTo(device, song(1))
  await Promise.all([usePlayerStore.getState().togglePlay(), usePlayerStore.getState().togglePlay()])
  expect(dlna.control.mock.calls.map(([action]) => action)).toEqual(['pause', 'play'])
  expect(usePlayerStore.getState().isPlaying).toBe(true)
})

test('disconnect during an in-flight cast stops that renderer too', async () => {
  let finish: () => void = () => { }
  dlna.cast.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve }))
  const casting = useDlnaStore.getState().castTo(device, song(1))
  await Promise.resolve()
  await Promise.resolve()
  const disconnecting = useDlnaStore.getState().disconnect()
  finish()
  await Promise.all([casting, disconnecting])
  expect(dlna.control).toHaveBeenLastCalledWith('stop', { deviceId: device.id })
  expect(useDlnaStore.getState().activeDevice).toBeNull()
})
