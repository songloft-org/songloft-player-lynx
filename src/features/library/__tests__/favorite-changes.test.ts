import { afterEach, expect, test, vi } from 'vitest'
import { getQueryClient } from '../../../lib/query/index.js'
import { parseFavoriteChange, refreshFavoritesFromServer } from '../data/favorite-changes.js'

const { get } = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock('../../../core/network/api-client.js', async importOriginal => ({
  ...await importOriginal<object>(), getSharedClient: () => ({ get }),
}))
vi.mock('../../player/store/index.js', () => ({ usePlayerStore: { getState: () => ({ currentSong: null }) } }))
vi.mock('../../../native/audio-facade.js', () => ({ getAudio: () => ({ setFavorite: vi.fn() }) }))

afterEach(() => { getQueryClient().clear(); vi.clearAllMocks() })

test('server invalidation replaces the complete cache and invalidates favorite playlist views', async () => {
  const queries = getQueryClient()
  queries.setQueryData(['favorites', 'songIds'], new Set([1, 2]))
  queries.setQueryData(['playlist', 'songs', 1], 'old songs')
  queries.setQueryData(['playlist', 'songs', 2], 'old radios')
  get.mockResolvedValue({ data: { ids: [3, 4] } })
  await refreshFavoritesFromServer({ serverBaseUrl: 'https://music.test/sub', assertCurrent: () => {} })
  expect(get.mock.calls[0]![0]).toBe('https://music.test/sub/api/v1/playlists/1/song-ids')
  expect(queries.getQueryData(['favorites', 'songIds'])).toEqual(new Set([3, 4]))
  expect(queries.getQueryState(['playlist', 'songs', 1])?.isInvalidated).toBe(true)
  expect(queries.getQueryState(['playlist', 'songs', 2])?.isInvalidated).toBe(true)
})

test('a response received after a server/account switch cannot replace the new cache', async () => {
  const queries = getQueryClient()
  let resolve!: (value: unknown) => void
  get.mockImplementation(() => new Promise(done => { resolve = done }))
  let current = true
  const running = refreshFavoritesFromServer({ serverBaseUrl: 'https://old.test', assertCurrent: () => { if (!current) throw new Error('session changed') } })
  await vi.waitFor(() => expect(get).toHaveBeenCalledTimes(1))
  current = false
  queries.setQueryData(['favorites', 'songIds'], new Set([99]))
  resolve({ data: { ids: [1] } })
  await expect(running).rejects.toThrow('session changed')
  expect(queries.getQueryData(['favorites', 'songIds'])).toEqual(new Set([99]))
})

test('malformed notifications do not become refresh storms', () => {
  for (const value of [{}, { cursor: '', changed: true }, { cursor: 'one', changed: 'yes' }]) expect(() => parseFavoriteChange(value)).toThrow()
  expect(parseFavoriteChange({ cursor: 'opaque', changed: false })).toEqual({ cursor: 'opaque', changed: false })
})
