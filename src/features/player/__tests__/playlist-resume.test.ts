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
   Object.assign(mocks.state, { playlist: songs, currentSong: songs[index], sourcePlaylistId: 3, playbackContext: context, confirmedSongId: (songs[index] as { id: number }).id })
  }),
  hydratePlaylistQueue: vi.fn(),
  seek: vi.fn(async () => {}),
  togglePlay: vi.fn(async () => {}),
 }
 mocks.api.getPlaylist.mockResolvedValue({ id: 3, labels: ['audiobook'], sortBy: 'position', sortOrder: 'asc' })
 mocks.api.getProgress.mockResolvedValue({ version: 0, play_mode: '', song: null })
 mocks.api.saveProgress.mockResolvedValue({ version: 1 })
 mocks.api.getPlaylistSongIds.mockResolvedValue(Array.from({ length: 150 }, (_, i) => i + 1))
 mocks.api.getPlaylistSongs.mockImplementation(async (_id, _filter, page) => ({
  songs: Array.from({ length: page.offset ? 50 : 100 }, (_, i) => song((page.offset ?? 0) + i + 1)), total: 150,
 }))
})
test('episode search selection starts at the target and hydrates the entire original order', async () => {
 await playPlaylistTarget({ id: 3, song: song(128) })
 expect(mocks.state.setPlayMode).toHaveBeenCalledWith('order')
 expect(mocks.state.playPlaylist.mock.calls[0][0][0].id).toBe(128)
 const queue = mocks.state.hydratePlaylistQueue.mock.calls[0][0]
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
