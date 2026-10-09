import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import type { Song } from '../../../models/song.js'
import { getAudio } from '../../../native/index.js'
import type { AudioEvent } from '../../../native/audio-types.js'
import { usePlayerStore } from '../store/player-store.js'
import { pollPlayback, useDlnaStore } from '../store/dlna-store.js'
import { hasNext, hasPrev } from '../store/derive.js'
import { buildSongMenuItems } from '../../../shared/ui/song-menu-items.js'

const dlna = vi.hoisted(() => ({
  available: true,
  cast: vi.fn(async (_options: unknown) => {}),
  control: vi.fn(async (_action: string, _options?: unknown) => {}),
  getPlaybackState: vi.fn(async (_id: string) => ({ state: 'PLAYING', positionMs: 5000, durationMs: 60000 })),
}))
vi.mock('../../../native/dlna.js', () => ({ getDlnaModule: () => dlna }))
vi.mock('../store/lyric-store.js', () => ({
  useLyricStore: { getState: () => ({ loadForSong: vi.fn(), syncPosition: vi.fn(), clear: vi.fn() }) },
}))
const events = vi.hoisted(() => ({ recordPlayed: vi.fn(async (_id: number, _context?: unknown) => {}) }))
const cache = vi.hoisted(() => ({ getCachedPath: vi.fn(async (_id: number): Promise<string | null> => null) }))
vi.mock('../../library/api/index.js', () => ({ getSongsApi: () => events }))
vi.mock('../data/song-cache.js', async (original) => ({
  ...(await original<Record<string, unknown>>()), getCachedPath: cache.getCachedPath,
}))

const song = (id: number) => ({
  id, type: 'local', title: `Song ${id}`, duration: 60, format: 'mp3',
  url: `/api/v1/songs/${id}/play`, isLive: false, isVideo: false,
}) as Song
const device = { id: 'speaker', name: 'Speaker', location: 'http://192.168.2.2/desc.xml' }
const audio = getAudio()
const emit = (event: AudioEvent) => (audio as unknown as { emit(event: AudioEvent): void }).emit(event)
const state = () => usePlayerStore.getState()
const ids = () => state().playlist.map(value => value.id)
const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve() }

beforeEach(async () => {
  vi.useFakeTimers()
  await useDlnaStore.getState().disconnect()
  state().reset()
  vi.clearAllMocks()
  cache.getCachedPath.mockReset().mockResolvedValue(null)
})
afterEach(async () => {
  await useDlnaStore.getState().disconnect()
  state().reset()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

test('every song menu offers play next using the existing translated label', () => {
  for (const row of [null, { isWide: true }, { isWide: false }]) {
    expect(buildSongMenuItems(key => key, row)).toContainEqual({ key: 'playNext', label: 'songMenu.playNext', icon: 'skip-next' })
  }
})

test('moves an existing song after current without reloading, seeking or replacing context', async () => {
  await state().playPlaylist([song(1), song(2), song(3)], 1, { type: 'playlist', key: '7' })
  await state().seek(12000)
  const load = vi.spyOn(audio, 'load')
  await state().playSongNext(song(1))
  expect(ids()).toEqual([2, 1, 3])
  expect(state()).toMatchObject({ currentIndex: 0, currentTime: 12000, sourcePlaylistId: 7 })
  expect(load).not.toHaveBeenCalled()
})

test.each(['order', 'loop', 'single', 'random'] as const)('manual priority overrides %s for manual and automatic next', async mode => {
  await state().playPlaylist([song(1), song(2)], 1)
  state().setPlayMode(mode)
  await state().playSongNext(song(3))
  await state().playSongNext(song(4))
  await state().playSongNext(song(3))
  expect(ids()).toEqual([1, 2, 3, 4])
  expect(hasNext(state())).toBe(true)
  emit({ type: 'stateChanged', state: 'completed' })
  await flush()
  expect(state().currentSong?.id).toBe(3)
  await state().playNext()
  expect(state().currentSong?.id).toBe(4)
  expect(state().playMode).toBe(mode)
})

test('current song can be scheduled once more, and empty queue starts playback', async () => {
  await state().playSongNext(song(1))
  expect(state()).toMatchObject({ currentIndex: 0, isPlaying: true })
  await state().playSongNext(song(1))
  await state().playSongNext(song(1))
  expect(ids()).toEqual([1, 1])
  await state().playNext()
  expect(state().currentIndex).toBe(1)
})

async function playedThree(): Promise<void> {
  await state().playPlaylist([song(1), song(2), song(3)])
  state().setPlayMode('random')
  await state().playSongNext(song(2))
  await state().playNext()
  await state().playSongNext(song(3))
  await state().playNext()
}

test('random previous follows actual history beyond three seconds, then next retraces it', async () => {
  await playedThree()
  await state().seek(15000)
  await state().playPrev()
  expect(state().currentSong?.id).toBe(2)
  await state().playPrev()
  expect(state().currentSong?.id).toBe(1)
  expect(hasPrev(state())).toBe(false)
  await state().playPrev()
  expect(state().currentSong?.id).toBe(1)
  await state().playNext()
  expect(state().currentSong?.id).toBe(2)
  await state().playNext()
  expect(state().currentSong?.id).toBe(3)
})

test('rapid previous twice and next preserve the requested history cursor', async () => {
  await playedThree()
  await Promise.all([state().playPrev(), state().playPrev()])
  expect(state().currentSong?.id).toBe(1)
  await state().playNext()
  expect(state().currentSong?.id).toBe(2)
})

test('scheduling while previous is pending preserves history and branches only on playback', async () => {
  await playedThree()
  const previous = state().playPrev()
  await state().playSongNext(song(4))
  await previous
  expect(state().currentSong?.id).toBe(2)
  await state().playPrev()
  expect(state().currentSong?.id).toBe(1)
  await state().playNext()
  expect(state().currentSong?.id).toBe(4)
  await state().playPrev()
  expect(state().currentSong?.id).toBe(1)
})

test('previous during an unplayed load returns the last actually played track', async () => {
  await playedThree()
  await state().playSongNext(song(4))
  await Promise.all([state().playNext(), state().playPrev()])
  expect(state().currentSong?.id).toBe(3)
})

test('removing a preceding song remaps history and manual priority', async () => {
  await playedThree()
  await state().playSongNext(song(4))
  await state().removeFromPlaylist(0)
  await state().playPrev()
  expect(state().currentSong?.id).toBe(2)
  await state().playNext()
  expect(state().currentSong?.id).toBe(4)
})

test('selecting in the current queue preserves context, loader and scheduled next', async () => {
  await state().playPlaylist([song(1), song(2)], 0, { type: 'playlist', key: '7' })
  await state().playSongNext(song(3))
  await state().playQueueIndex(2)
  expect(state().sourcePlaylistId).toBe(7)
  await state().playNext()
  expect(state().currentSong?.id).toBe(3)
})

test('failed load does not become the previous song', async () => {
  await playedThree()
  await state().playSongNext(song(4))
  vi.spyOn(audio, 'load').mockRejectedValueOnce(new Error('unavailable'))
  await expect(state().playNext()).rejects.toThrow('unavailable')
  await state().playPrev()
  expect(state().currentSong?.id).toBe(3)
})

test('native command acknowledgement without actual playing does not enter history', async () => {
  await playedThree()
  await state().playSongNext(song(4))
  // Native play() resolves when the command is sent, before the playing event.
  vi.spyOn(audio, 'play').mockResolvedValueOnce(undefined)
  await state().playNext()
  await state().playSongNext(song(5))
  await state().playNext()
  await state().playPrev()
  expect(state().currentSong?.id).toBe(3)
})

test('first playback succeeding on retry reports exactly one actual play event', async () => {
  vi.spyOn(audio, 'play').mockResolvedValueOnce(undefined)
  await state().playPlaylist([song(1)], 0)
  expect(events.recordPlayed).not.toHaveBeenCalled()
  emit({ type: 'error', code: 'network', message: 'first preparation failed' })
  await vi.advanceTimersByTimeAsync(1000)
  await flush()
  // The native command can resolve before its asynchronous playing event.
  emit({ type: 'stateChanged', state: 'playing' })
  expect(events.recordPlayed).toHaveBeenCalledTimes(1)
  expect(events.recordPlayed).toHaveBeenCalledWith(1, undefined)
  emit({ type: 'error', code: 'network', message: 'later stream failure' })
  await vi.advanceTimersByTimeAsync(3000)
  await flush()
  expect(events.recordPlayed).toHaveBeenCalledTimes(1)
})

test('audio-track switch before first playing still records the song in history', async () => {
  await state().playPlaylist([song(1), song(2), song(3)])
  state().setPlayMode('random')
  await state().playSongNext(song(2))
  vi.spyOn(audio, 'play').mockResolvedValueOnce(undefined)
  await state().playNext()
  await state().setAudioTrack(2)
  await state().playSongNext(song(3))
  await state().playNext()
  await state().playPrev()
  expect(state().currentSong?.id).toBe(2)
  expect(events.recordPlayed.mock.calls.filter(([id]) => id === 2)).toHaveLength(2)
})

test('deleting current while a new queue starts cannot switch the new queue', async () => {
  await state().playPlaylist([song(1), song(2)])
  const removing = state().removeFromPlaylist(0)
  await state().playPlaylist([song(7), song(8)], 1)
  await removing
  expect(state().currentSong?.id).toBe(8)
})

test('late metadata from a scheduled queue cannot replace the new queue notification', async () => {
  await state().playPlaylist([song(1), song(2)])
  let resolveCache!: (value: null) => void
  const pending = new Promise<null>(resolve => { resolveCache = resolve })
  cache.getCachedPath.mockImplementation(async id => id < 7 ? pending : null)
  const setQueue = vi.spyOn(audio, 'setQueue')
  await state().playSongNext(song(3))
  await state().playPlaylist([song(7), song(8)], 1)
  resolveCache(null)
  await flush()
  expect(setQueue.mock.calls.at(-1)?.[0].map(item => item.id)).toEqual([7, 8])
  expect(state().currentSong?.id).toBe(8)
})

test('late stop acknowledgement after deleting the last song keeps new playback active', async () => {
  await state().playPlaylist([song(1)])
  let resolveStop!: () => void
  vi.spyOn(audio, 'stop').mockImplementationOnce(() => new Promise<void>(resolve => { resolveStop = resolve }))
  const removing = state().removeFromPlaylist(0)
  await state().playPlaylist([song(7)])
  resolveStop()
  await removing
  expect(state().currentSong?.id).toBe(7)
  expect(state().isPlaying).toBe(true)
  expect(state().duration).toBe(60000)
})

test('native stop clears manual priority and history before a bare song starts', async () => {
  await state().playPlaylist([song(1), song(2)])
  state().setPlayMode('random')
  await state().playNext()
  await state().playSongNext(song(4))
  emit({ type: 'remoteCommand', command: 'stop' })
  expect(state().hasPriorityNext).toBe(false)
  expect(state().hasHistoryPrevious).toBe(false)
  expect(state().nextQueueIndex).toBeNull()
  await state().playSong(song(3))
  await state().playPrev()
  expect(state().currentSong?.id).toBe(3)
  expect(state().hasHistoryPrevious).toBe(false)
})

test('switching mode during an unfinished load remembers the last actual playback', async () => {
  await state().playPlaylist([song(1), song(2)])
  await state().playSongNext(song(2))
  const next = state().playNext()
  state().setPlayMode('random')
  await state().playPrev()
  await next
  expect(state().currentSong?.id).toBe(1)
})

test('moving a scheduled song from before current preserves earlier history', async () => {
  await playedThree()
  await state().playSongNext(song(1))
  expect(ids()).toEqual([2, 3, 1])
  await state().playPrev()
  expect(state().currentSong?.id).toBe(2)
  await state().playNext()
  expect(state().currentSong?.id).toBe(1)
})

test('changing mode preserves manual priority and replacing the queue resets it', async () => {
  await state().playPlaylist([song(1), song(2)])
  await state().playSongNext(song(3))
  state().setPlayMode('single')
  await state().playNext()
  expect(state().currentSong?.id).toBe(3)
  await state().playPlaylist([song(7), song(8)])
  state().setPlayMode('random')
  expect(hasPrev(state())).toBe(false)
  await state().playNext()
  expect(state().currentSong?.id).toBe(8)
})

test('removing pending priority and invalid removals preserve valid navigation', async () => {
  await playedThree()
  await state().playSongNext(song(4))
  await state().removeFromPlaylist(-1)
  await state().removeFromPlaylist(999)
  await state().removeFromPlaylist(3)
  await state().playPrev()
  expect(state().currentSong?.id).toBe(2)
  await state().playNext()
  expect(state().currentSong?.id).toBe(3)
})

test('batch insert keeps its given order, and order previous still restarts after three seconds', async () => {
  await state().playPlaylist([song(1), song(2)])
  state().insertNextInQueue([song(3), song(4)])
  expect(ids()).toEqual([1, 3, 4, 2])
  await state().playNext()
  await state().seek(15000)
  await state().playPrev()
  expect(state().currentSong?.id).toBe(3)
  expect(state().currentTime).toBe(0)
  await state().playNext()
  expect(state().currentSong?.id).toBe(4)
})

test('scheduling and queue selection keep an in-flight background fill active', async () => {
  await state().playPlaylist([song(1), song(2)])
  let finish: (songs: Song[]) => void = () => {}
  const fetch = vi.fn(() => new Promise<Song[]>(resolve => { finish = resolve }))
  state().loadRemainingSongsForCurrentPlaylist({ loadedCount: 2, total: 3, fetch })
  await flush()
  await state().playSongNext(song(4))
  await state().playQueueIndex(2)
  finish([song(3)])
  await flush()
  expect(ids()).toEqual([1, 4, 2, 3])
})

test('clearing during a load prevents old history or playback from returning', async () => {
  await playedThree()
  const next = state().playPrev()
  state().clearPlaylist()
  await next
  expect(state().playlist).toEqual([])
  expect(hasPrev(state())).toBe(false)
  await state().playSongNext(song(9))
  state().setPlayMode('random')
  expect(hasPrev(state())).toBe(false)
})

test('prefetch uses the same manual target that completion plays', async () => {
  const fetch = vi.fn(async () => ({ arrayBuffer: async () => new ArrayBuffer(0) }))
  vi.stubGlobal('fetch', fetch)
  await state().playPlaylist([song(1), song(2)])
  state().setPlayMode('single')
  await state().playSongNext(song(3))
  emit({ type: 'progress', positionMs: 50000, bufferedMs: 60000, durationMs: 60000 })
  expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/songs/3/play'), expect.objectContaining({ headers: { Range: 'bytes=0-131071' } }))
  emit({ type: 'stateChanged', state: 'completed' })
  await flush()
  expect(state().currentSong?.id).toBe(3)
})

test('random preview is reused for next and never adds unplayed history', async () => {
  await state().playPlaylist([song(1), song(2), song(3)])
  state().setPlayMode('random')
  const preview = state().nextQueueIndex
  expect(hasPrev(state())).toBe(false)
  await state().playNext()
  expect(state().currentIndex).toBe(preview)
  await state().playPrev()
  expect(state().currentSong?.id).toBe(1)
})

test('song type is part of queue identity for scheduling and direct selection', async () => {
  const remote = { ...song(1), type: 'remote' as const }
  await state().playPlaylist([song(1), song(2)])
  await state().playSongNext(remote)
  expect(state().playlist.map(value => `${value.id}:${value.type}`)).toEqual(['1:local', '1:remote', '2:local'])
  await state().playSong(remote)
  expect(state().currentSong?.type).toBe('remote')
})

test('DLNA completion and history honor manual priority in single and random modes', async () => {
  await state().playPlaylist([song(1), song(2)])
  await useDlnaStore.getState().castTo(device, song(1))
  state().setPlayMode('single')
  await state().playSongNext(song(3))
  await pollPlayback()
  dlna.getPlaybackState.mockResolvedValueOnce({ state: 'STOPPED', positionMs: 60000, durationMs: 60000 })
  await pollPlayback()
  await flush()
  expect(state().currentSong?.id).toBe(3)
  state().setPlayMode('random')
  await state().playSongNext(song(2))
  await state().playNext()
  await state().seek(15000)
  await state().playPrev()
  expect(state().currentSong?.id).toBe(3)
})

test('failed cast after previous clears the pending cursor and does not record failure', async () => {
  await playedThree()
  await useDlnaStore.getState().castTo(device, song(3))
  dlna.cast.mockRejectedValueOnce(new Error('UPnP failure'))
  await expect(state().playPrev()).rejects.toThrow('UPnP failure')
  await state().playNext()
  await state().playPrev()
  expect(state().currentSong?.id).toBe(3)
})
