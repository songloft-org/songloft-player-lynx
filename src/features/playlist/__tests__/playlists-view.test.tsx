import '../../../shims/router-env.js'

import '@testing-library/jest-dom'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { act, fireEvent, getQueriesForElement, render } from '@lynx-js/react/testing-library'

import type { Playlist } from '../../../models/playlist.js'

const { listHook, createMutationHook, reorderMutationHook } = vi.hoisted(() => ({
  listHook: vi.fn(),
  createMutationHook: vi.fn(),
  reorderMutationHook: vi.fn(),
}))

vi.mock('react-i18next', async () =>
  (await import('../../../__tests__/_render-mocks.js')).mockReactI18next(),
)

vi.mock('@tanstack/react-router', () => ({ useNavigate: () => () => {} }))

vi.mock('@lynx-js/lynx-ui-input', async () =>
  (await import('../../../__tests__/_render-mocks.js')).mockLynxUiInput(),
)

vi.mock('../data/playlist-query.js', () => ({
  usePlaylistsInfiniteQuery: listHook,
  playlistQueryKeys: { list: () => [] },
}))

vi.mock('../data/playlist-mutations.js', () => ({
  useCreatePlaylistMutation: createMutationHook,
  useReorderPlaylistsMutation: reorderMutationHook,
}))

const { PlaylistsView } = await import('../widgets/PlaylistsView.js')

function makePlaylist(id: number, over: Partial<Playlist> = {}): Playlist {
  return {
    id,
    type: 'normal',
    name: `Playlist ${id}`,
    description: undefined,
    coverUrl: undefined,
    labels: [],
    songCount: 0,
    createdAt: '',
    updatedAt: '',
    isBuiltIn: false,
    isAutoCreated: false,
    isHidden: false,
    ...over,
  }
}

function listResult(pages: { playlists: Playlist[]; total: number }[], over = {}) {
  return {
    data: { pages },
    isLoading: false,
    isError: false,
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(),
    ...over,
  }
}

function mutationResult(over = {}) {
  return {
    mutate: vi.fn(),
    isPending: false,
    ...over,
  }
}

beforeEach(() => {
  listHook.mockReturnValue(listResult([{ playlists: [], total: 0 }]))
  createMutationHook.mockReturnValue(mutationResult())
  reorderMutationHook.mockReturnValue(mutationResult())
})

afterEach(() => vi.clearAllMocks())

async function renderView() {
  render(<PlaylistsView />)
  await act(async () => {
    await Promise.resolve()
  })
  return getQueriesForElement(elementTree.root!)
}

test('renders a card per playlist with name and song count', async () => {
  listHook.mockReturnValue(
    listResult([
      {
        playlists: [
          makePlaylist(1, { name: 'Favorites', songCount: 5 }),
          makePlaylist(2, { name: 'Chill', songCount: 1 }),
        ],
        total: 2,
      },
    ]),
  )
  const { queryByText } = await renderView()

  expect(queryByText('Favorites')).toBeInTheDocument()
  expect(queryByText('5 songs')).toBeInTheDocument()
  expect(queryByText('Chill')).toBeInTheDocument()
  expect(queryByText('1 song')).toBeInTheDocument()
})

test('shows the empty state when there are no playlists', async () => {
  listHook.mockReturnValue(listResult([{ playlists: [], total: 0 }]))
  const { queryByText } = await renderView()
  expect(queryByText('No playlists yet')).toBeInTheDocument()
})

test('shows the loading state', async () => {
  listHook.mockReturnValue(listResult([], { isLoading: true, data: undefined }))
  const { queryByText } = await renderView()
  expect(queryByText('Loading playlists…')).toBeInTheDocument()
})

test('shows the error state when the query errors with no data', async () => {
  listHook.mockReturnValue(
    listResult([], { isError: true, data: undefined }),
  )
  const { queryByText } = await renderView()
  expect(queryByText('Could not load playlists.')).toBeInTheDocument()
})

test('renders the create playlist button', async () => {
  listHook.mockReturnValue(
    listResult([
      { playlists: [makePlaylist(1, { name: 'Test' })], total: 1 },
    ]),
  )
  const { queryByText } = await renderView()
  expect(queryByText('Create playlist')).toBeInTheDocument()
})

test('shows create playlist button even in empty state', async () => {
  listHook.mockReturnValue(listResult([{ playlists: [], total: 0 }]))
  const { queryByText } = await renderView()
  expect(queryByText('Create playlist')).toBeInTheDocument()
})

test('entering sort mode shows both playlist names and a done button', async () => {
  listHook.mockReturnValue(
    listResult([
      {
        playlists: [
          makePlaylist(1, { name: 'Favorites' }),
          makePlaylist(2, { name: 'Chill' }),
        ],
        total: 2,
      },
    ]),
  )
  const { queryByTestId, queryByText } = await renderView()
  await act(async () => {
    fireEvent.tap(queryByTestId('playlists-sort-toggle')!)
    await Promise.resolve()
  })
  expect(queryByText('Favorites')).toBeInTheDocument()
  expect(queryByText('Chill')).toBeInTheDocument()
  expect(queryByText('Done')).toBeInTheDocument()
})

test('moving a playlist down submits the swapped order to the reorder mutation', async () => {
  const mutate = vi.fn()
  reorderMutationHook.mockReturnValue(mutationResult({ mutate }))
  listHook.mockReturnValue(
    listResult([
      {
        playlists: [
          makePlaylist(1, { name: 'Favorites' }),
          makePlaylist(2, { name: 'Chill' }),
        ],
        total: 2,
      },
    ]),
  )
  const { queryByTestId } = await renderView()
  await act(async () => {
    fireEvent.tap(queryByTestId('playlists-sort-toggle')!)
    await Promise.resolve()
  })
  await act(async () => {
    fireEvent.tap(queryByTestId('playlists-move-down-1')!)
    await Promise.resolve()
  })
  expect(mutate).toHaveBeenCalledWith([2, 1])
})
