import { afterEach, describe, expect, test, vi } from 'vitest'
import { QueryClient } from '@tanstack/react-query'

import { playlistQueryKeys } from '../data/playlist-query.js'

vi.mock('../api/index.js', () => ({
  getPlaylistApi: () => mockApi,
}))

const mockApi = {
  createPlaylist: vi.fn(),
  updatePlaylist: vi.fn(),
  deletePlaylist: vi.fn(),
  addSongsToPlaylist: vi.fn(),
  removeSongFromPlaylist: vi.fn(),
}

afterEach(() => vi.clearAllMocks())

describe('mutation invalidation keys', () => {
  test('playlistQueryKeys.list produces a list key with filters', () => {
    const key = playlistQueryKeys.list({ type: 'normal' })
    expect(key).toEqual(['playlist', 'list', { type: 'normal' }])
  })

  test('playlistQueryKeys.detail produces a detail key with id', () => {
    const key = playlistQueryKeys.detail(7)
    expect(key).toEqual(['playlist', 'detail', 7])
  })

  test('playlistQueryKeys.songs produces a songs key with id and filters', () => {
    const key = playlistQueryKeys.songs(7, { sort: 'position' })
    expect(key).toEqual(['playlist', 'songs', 7, { sort: 'position' }])
  })

  test('list invalidation prefix matches any list filters', () => {
    const queryClient = new QueryClient()
    const key1 = playlistQueryKeys.list({ type: 'normal' })
    const key2 = playlistQueryKeys.list({ type: 'radio' })
    queryClient.setQueryData(key1, { playlists: [], total: 0 })
    queryClient.setQueryData(key2, { playlists: [], total: 0 })

    void queryClient.invalidateQueries({ queryKey: ['playlist', 'list'] })

    const state1 = queryClient.getQueryState(key1)
    const state2 = queryClient.getQueryState(key2)
    expect(state1?.isInvalidated).toBe(true)
    expect(state2?.isInvalidated).toBe(true)
  })

  test('songs invalidation with playlist id prefix matches any song filters', () => {
    const queryClient = new QueryClient()
    const key1 = playlistQueryKeys.songs(7, { sort: 'position' })
    const key2 = playlistQueryKeys.songs(7, { sort: 'title' })
    queryClient.setQueryData(key1, { songs: [], total: 0 })
    queryClient.setQueryData(key2, { songs: [], total: 0 })

    void queryClient.invalidateQueries({ queryKey: ['playlist', 'songs', 7] })

    const state1 = queryClient.getQueryState(key1)
    const state2 = queryClient.getQueryState(key2)
    expect(state1?.isInvalidated).toBe(true)
    expect(state2?.isInvalidated).toBe(true)
  })

  test('detail invalidation targets exact playlist id', () => {
    const queryClient = new QueryClient()
    const key7 = playlistQueryKeys.detail(7)
    const key8 = playlistQueryKeys.detail(8)
    queryClient.setQueryData(key7, { id: 7 })
    queryClient.setQueryData(key8, { id: 8 })

    void queryClient.invalidateQueries({ queryKey: playlistQueryKeys.detail(7) })

    expect(queryClient.getQueryState(key7)?.isInvalidated).toBe(true)
    expect(queryClient.getQueryState(key8)?.isInvalidated).toBe(false)
  })
})
