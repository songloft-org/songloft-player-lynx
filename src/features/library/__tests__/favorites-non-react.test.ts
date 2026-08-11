import { afterEach, describe, expect, test, vi } from 'vitest'

import { getQueryClient } from '../../../lib/query/index.js'
import { getFavoriteState, toggleFavoriteNonReact } from '../data/favorites.js'

vi.mock('../../playlist/api/index.js', () => ({
  getPlaylistApi: () => mockApi,
}))

const mockApi = {
  getPlaylistSongs: vi.fn(),
  addSongsToPlaylist: vi.fn(),
  removeSongFromPlaylist: vi.fn(),
}

afterEach(() => {
  vi.clearAllMocks()
  getQueryClient().clear()
})

/** One page of `getPlaylistSongs` covering every id in `ids` (no pagination). */
function songsPage(ids: number[]) {
  return { songs: ids.map((id) => ({ id })), total: ids.length }
}

describe('toggleFavoriteNonReact (native remoteCommand pathway, outside React)', () => {
  test('adds the song when it is not yet a favorite', async () => {
    mockApi.getPlaylistSongs.mockResolvedValue(songsPage([1, 2]))
    mockApi.addSongsToPlaylist.mockResolvedValue(undefined)

    const result = await toggleFavoriteNonReact(3)

    expect(result).toBe(true)
    expect(mockApi.addSongsToPlaylist).toHaveBeenCalledWith(1, [3])
    expect(mockApi.removeSongFromPlaylist).not.toHaveBeenCalled()
  })

  test('removes the song when it is already a favorite', async () => {
    mockApi.getPlaylistSongs.mockResolvedValue(songsPage([1, 2, 3]))
    mockApi.removeSongFromPlaylist.mockResolvedValue(undefined)

    const result = await toggleFavoriteNonReact(3)

    expect(result).toBe(false)
    expect(mockApi.removeSongFromPlaylist).toHaveBeenCalledWith(1, 3)
    expect(mockApi.addSongsToPlaylist).not.toHaveBeenCalled()
  })
})

describe('getFavoriteState', () => {
  test('reflects membership in the favorites playlist', async () => {
    mockApi.getPlaylistSongs.mockResolvedValue(songsPage([5, 9]))

    expect(await getFavoriteState(9)).toBe(true)
    expect(await getFavoriteState(1)).toBe(false)
  })
})
