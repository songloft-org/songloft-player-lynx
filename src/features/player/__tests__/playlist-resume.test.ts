import { beforeEach, expect, test, vi } from 'vitest'
import { parseSong } from '../../../models/song.js'
const mocks = vi.hoisted(() => ({
 api: { getPlaylist: vi.fn(), getProgress: vi.fn(), saveProgress: vi.fn(), getPlaylistSongs: vi.fn(), getPlaylistSongIds: vi.fn() },
 state: {} as Record<string, any>,
}))
vi.mock('../../playlist/api/index.js', () => ({ getPlaylistApi: () => mocks.api }))
vi.mock('../store/player-store.js', () => ({ usePlayerStore: { getState: () => mocks.state, setState: (s: object) => Object.assign(mocks.state, s), subscribe: () => () => {} } }))
vi.mock('../../../shared/ui/toast-store.js', () => ({ toast: { error: vi.fn() } }))
import { playPlaylistTarget, flushPlaylistProgress } from '../data/playlist-resume.js'
const song = (id: number) => parseSong({ id, type: 'local', title: `Episode ${id}` })
beforeEach(() => {
 vi.clearAllMocks()
 mocks.state = {
  currentTime: 0, playMode: 'random', isPlaying: false,
  setPlayMode: vi.fn((mode: string) => { mocks.state.playMode = mode }),
  playPlaylist: vi.fn(async (songs: unknown[], index: number, context: unknown) => {
   Object.assign(mocks.state, { playlist: songs, currentIndex: index, currentSong: songs[index], sourcePlaylistId: 3, playbackContext: context, confirmedSongId: (songs[index] as { id: number }).id })
  }),
  hydratePlaylistQueue: vi.fn((songs: ReturnType<typeof song>[]) => {
   mocks.state.playlist = songs
   mocks.state.currentIndex = songs.findIndex(s => s.id === mocks.state.currentSong?.id)
  }),
  seek: vi.fn(async () => {}),
  togglePlay: vi.fn(async () => {}),
 }
 mocks.api.getPlaylist.mockResolvedValue({ id: 3, labels: ['audiobook'], sortBy: 'position', sortOrder: 'asc' })
 mocks.api.getProgress.mockResolvedValue({ version: 0, play_mode: '', song: null })
 mocks.api.saveProgress.mockResolvedValue({ version: 1 })
 mocks.api.getPlaylistSongIds.mockResolvedValue(Array.from({ length: 150 }, (_, i) => i + 1))
 mocks.api.getPlaylistSongs.mockImplementation(async (_id, _filter, page) => ({
  songs: Array.from({ length: Math.min(page.limit, 150 - (page.offset ?? 0)) }, (_, i) => song((page.offset ?? 0) + i + 1)), total: 150,
 }))
})
test('episode search selection starts at the target and hydrates the entire original order', async () => {
 await playPlaylistTarget({ id: 3, song: song(128) })
 expect(mocks.state.setPlayMode).toHaveBeenCalledWith('order')
 const [initial, selected] = mocks.state.playPlaylist.mock.calls[0]
 expect(initial[selected].id).toBe(128)
 const queue = mocks.state.hydratePlaylistQueue.mock.calls.at(-1)![0]
 expect(queue.map((s: { id: number }) => s.id)).toEqual(Array.from({ length: 150 }, (_, i) => i + 1))
 for (const call of mocks.api.getPlaylistSongs.mock.calls) expect(call[1]).toEqual({ sort: 'position', order: 'asc' })
 expect(mocks.state.seek).not.toHaveBeenCalled()
})
test('continue restores the playlist mode and exact milliseconds', async () => {
 mocks.api.getProgress.mockResolvedValue({ version: 7, play_mode: 'single', song: { id: 128, type: 'local', title: 'Episode 128' }, position_ms: 754000 })
 await playPlaylistTarget({ id: 3, resume: true })
 expect(mocks.state.setPlayMode).toHaveBeenCalledWith('single')
 expect(mocks.state.playPlaylist.mock.calls[0][3]).toEqual({ initialPositionMs: 754000 })
})
test('removed history entry cannot replace the playing queue', async () => {
 mocks.api.getPlaylistSongIds.mockResolvedValue([1, 2])
 await expect(playPlaylistTarget({ id: 3, song: song(128) })).rejects.toThrow()
 expect(mocks.state.playPlaylist).not.toHaveBeenCalled()
})
test('flushing a finished playlist retains its terminal completion state', async () => {
 await playPlaylistTarget({ id: 3, song: song(150) })
 mocks.state.playlistCompleted = true
 flushPlaylistProgress()
 await new Promise(resolve => setTimeout(resolve, 0))
 expect(mocks.api.saveProgress.mock.calls.at(-1)?.[1]).toMatchObject({ completed: true, song_id: 150 })
})

test('a thousand-track playlist exposes the target and next episode before later pages finish', async () => {
 mocks.api.getPlaylistSongIds.mockResolvedValue(Array.from({ length: 1000 }, (_, i) => i + 1))
 let release!: () => void
 const pending = new Promise<void>(resolve => { release = resolve })
 let requests = 0
 mocks.api.getPlaylistSongs.mockImplementation(async (_id, _filter, page) => {
  if (++requests === 2) await pending
  return { songs: Array.from({ length: Math.min(page.limit, 1000 - (page.offset ?? 0)) }, (_, i) => song((page.offset ?? 0) + i + 1)), total: 1000 }
 })
 const playing = playPlaylistTarget({ id: 3, song: song(128) })
 try {
  await vi.waitFor(() => expect(requests).toBe(2))
  expect(mocks.state.playlist.length).toBeGreaterThan(1)
  expect(mocks.state.playlist[mocks.state.currentIndex + 1].id).toBe(129)
 } finally { release(); await playing }
 expect(mocks.state.playlist).toHaveLength(1000)
 expect(mocks.state.hydratePlaylistQueue.mock.calls.some(([songs]: [ReturnType<typeof song>[]]) => songs.length > 100 && songs.length < 1000)).toBe(true)
})

test('continuing a restored one-track queue repairs it without reloading or seeking the current audio', async () => {
 const current = song(128)
 Object.assign(mocks.state, { currentSong: current, playlist: [current], currentIndex: 0, sourcePlaylistId: 3, isPlaying: true, currentTime: 754000, confirmedSongId: current.id })
 mocks.api.getProgress.mockResolvedValue({ version: 7, play_mode: 'order', song: { id:128,type:'local',title:'Episode 128' }, position_ms: 750000 })
 await playPlaylistTarget({ id: 3, resume: true })
 expect(mocks.state.playlist).toHaveLength(150)
 expect(mocks.state.playPlaylist).not.toHaveBeenCalled()
 expect(mocks.state.seek).not.toHaveBeenCalled()
 expect(mocks.state.currentTime).toBe(754000)
})
