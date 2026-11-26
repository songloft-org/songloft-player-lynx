import '@testing-library/jest-dom'
import { afterEach, expect, test, vi } from 'vitest'
import { act, fireEvent, render } from '@lynx-js/react/testing-library'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { getQueryClient } from '../../../lib/query/index.js'
import { useAppSessionStore } from '../../../store/app-session.js'
import { useFavoriteToggle } from '../data/favorites.js'

const FAV_KEY = ['favorites', 'songIds']

const mockApi = vi.hoisted(() => ({
  getPlaylistSongs: vi.fn(),
  addSongsToPlaylist: vi.fn(),
  removeSongFromPlaylist: vi.fn(),
}))
vi.mock('../../playlist/api/index.js', () => ({ getPlaylistApi: () => mockApi }))

afterEach(() => {
  vi.clearAllMocks()
  getQueryClient().clear()
  useAppSessionStore.getState().reset()
})

function FavoriteToggle({ songId }: { songId: number }) {
  const { isFavorite, toggle } = useFavoriteToggle(songId)
  return (
    <view
      data-testid='fav-toggle'
      data-fav={isFavorite ? '1' : '0'}
      bindtap={toggle}
    />
  )
}

async function setup(initial: Set<number>) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  client.setQueryData(FAV_KEY, initial)
  // Stub the background refetch so it never overwrites our optimistic cache.
  mockApi.getPlaylistSongs.mockResolvedValue({ songs: [], total: 0 })
  render(
    <QueryClientProvider client={client}>
      <FavoriteToggle songId={3} />
    </QueryClientProvider>,
  )
  await act(async () => { for (let i = 0; i < 6; i++) await Promise.resolve() })
  return client
}

test('tapping favorite flips the cached set immediately, before the server replies', async () => {
  let resolveAdd!: (v: unknown) => void
  mockApi.addSongsToPlaylist.mockImplementation(() => new Promise(done => { resolveAdd = done }))

  const client = await setup(new Set([1, 2]))
  const toggle = document.querySelector('[data-testid="fav-toggle"]')!
  expect(toggle.getAttribute('data-fav')).toBe('0')

  await act(async () => {
    fireEvent.tap(toggle)
    // onMutate awaits cancelQueries before the optimistic setQueryData lands.
    for (let i = 0; i < 6; i++) await Promise.resolve()
  })
  // Server write is still pending — the cache must already reflect the tap.
  expect(client.getQueryData<Set<number>>(FAV_KEY)?.has(3)).toBe(true)

  await act(async () => { resolveAdd(undefined); await Promise.resolve() })
})

test('a failed favorite write rolls the cache back to the pre-tap state', async () => {
  mockApi.removeSongFromPlaylist.mockRejectedValue(new Error('network down'))

  const client = await setup(new Set([1, 2, 3]))
  const toggle = document.querySelector('[data-testid="fav-toggle"]')!
  expect(toggle.getAttribute('data-fav')).toBe('1')

  await act(async () => { fireEvent.tap(toggle) })
  await act(async () => { for (let i = 0; i < 10; i++) await Promise.resolve() })

  expect(client.getQueryData<Set<number>>(FAV_KEY)?.has(3)).toBe(true)
})

test('a failed favorite write cannot restore the cache after an account switch', async () => {
  let rejectAdd!: (reason: Error) => void
  mockApi.addSongsToPlaylist.mockImplementation(() => new Promise((_, reject) => { rejectAdd = reject }))
  const client = await setup(new Set([1, 2]))
  const toggle = document.querySelector('[data-testid="fav-toggle"]')!
  await act(async () => {
    fireEvent.tap(toggle)
    for (let i = 0; i < 10; i++) await Promise.resolve()
  })
  expect(client.getQueryData<Set<number>>(FAV_KEY)).toEqual(new Set([1, 2, 3]))

  client.clear()
  client.setQueryData(FAV_KEY, new Set([99]))
  await act(async () => {
    rejectAdd(new Error('previous account request failed'))
    for (let i = 0; i < 10; i++) await Promise.resolve()
  })
  expect(client.getQueryData<Set<number>>(FAV_KEY)).toEqual(new Set([99]))
})

test('a favorite write waiting on cache cancellation cannot start on another account', async () => {
  const client = await setup(new Set([1, 2]))
  useAppSessionStore.getState().setUsername('alice')
  let release!: () => void
  vi.spyOn(client, 'cancelQueries').mockImplementationOnce(
    () => new Promise<void>(resolve => { release = resolve }),
  )
  await act(async () => { fireEvent.tap(document.querySelector('[data-testid="fav-toggle"]')!) })
  useAppSessionStore.getState().setUsername('bob')
  client.clear()
  client.setQueryData(FAV_KEY, new Set([99]))
  await act(async () => {
    release()
    for (let i = 0; i < 10; i++) await Promise.resolve()
  })
  expect(mockApi.addSongsToPlaylist).not.toHaveBeenCalled()
  expect(client.getQueryData<Set<number>>(FAV_KEY)).toEqual(new Set([99]))
})
