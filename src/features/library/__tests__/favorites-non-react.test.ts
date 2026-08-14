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

/**
 * `fetchFavoriteSongIds` pages until it has `total` ids. Counting alone is not a
 * termination guarantee: whenever the server reports more rows than it returns
 * — a join row outliving its deleted song, a filtered page, an offset past the
 * end — the loop never satisfies its exit and re-requests forever. And because
 * `getFavoriteState` runs on **every track change**, the symptom is a permanent
 * request storm, not one stuck call. Stopping on an empty page is the real fix.
 */
describe('favorite id paging terminates on bad server data', () => {
  test('a short page against an inflated total stops instead of looping', async () => {
    // Server claims 500 favorites but only ever returns these two, then nothing.
    mockApi.getPlaylistSongs
      .mockResolvedValueOnce({ songs: [{ id: 1 }, { id: 2 }], total: 500 })
      .mockResolvedValue({ songs: [], total: 500 })

    expect(await getFavoriteState(1)).toBe(true)
    expect(await getFavoriteState(99)).toBe(false)
    // Page 1 had rows, page 2 was empty and ended it. Anything more means looping.
    expect(mockApi.getPlaylistSongs).toHaveBeenCalledTimes(2)
  })

  test('an immediately empty page does not request again', async () => {
    mockApi.getPlaylistSongs.mockResolvedValue({ songs: [], total: 42 })

    expect(await getFavoriteState(1)).toBe(false)
    expect(mockApi.getPlaylistSongs).toHaveBeenCalledTimes(1)
  })

  test('genuine multi-page favorites are still read to the end', async () => {
    mockApi.getPlaylistSongs
      .mockResolvedValueOnce({ songs: [{ id: 1 }, { id: 2 }], total: 3 })
      .mockResolvedValueOnce({ songs: [{ id: 7 }], total: 3 })

    expect(await getFavoriteState(7)).toBe(true)
    expect(mockApi.getPlaylistSongs).toHaveBeenCalledTimes(2)
  })
})
