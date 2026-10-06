import { expect, test, vi } from 'vitest'
import type { Song } from '../../../models/song.js'
import { collectCachePlaylist } from '../domain/cache-pagination.js'

test('whole-playlist caching reads beyond the visible page and respects the server page cap', async () => {
  const songs = Array.from({ length: 235 }, (_, id) => ({ id: id + 1 } as Song))
  const fetch = vi.fn(async (offset: number) => ({ songs: songs.slice(offset, offset + 50), total: 235 }))
  expect(await collectCachePlaylist({ fetch, valid: () => true })).toEqual(songs)
  expect(fetch.mock.calls.map(call => call[0])).toEqual([0, 50, 100, 150, 200])
})
test('server or user changes invalidate late pages before another page can be fetched', async () => {
  let valid = true
  const fetch = vi.fn(async () => { valid = false; return { songs: [{ id: 1 } as Song], total: 2 } })
  await expect(collectCachePlaylist({ fetch, valid: () => valid })).rejects.toThrow('cancelled')
  expect(fetch).toHaveBeenCalledTimes(1)
})
test('changing totals and premature empty pages fail instead of reporting a partial playlist as complete', async () => {
  for (const second of [{ songs: [{ id: 2 } as Song], total: 3 }, { songs: [], total: 2 }]) {
    const fetch = vi.fn().mockResolvedValueOnce({ songs: [{ id: 1 } as Song], total: 2 }).mockResolvedValueOnce(second)
    await expect(collectCachePlaylist({ fetch, valid: () => true })).rejects.toThrow('cache_playlist_changed')
  }
})
test('oversized or invalid collection sizes fail before opening media downloads', async () => {
  for (const total of [10001, -1, 0.5, NaN]) {
    await expect(collectCachePlaylist({ fetch: async () => ({ songs: [], total }), valid: () => true })).rejects.toThrow('cache_queue_full')
  }
})
