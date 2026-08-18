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

vi.mock('@lynx-js/lynx-ui-sortable', async () =>
  (await import('../../../__tests__/_render-mocks.js')).mockLynxUiSortable(),
)

vi.mock('../data/playlist-query.js', () => ({
  usePlaylistsInfiniteQuery: listHook,
  playlistQueryKeys: { list: () => [] },
}))

vi.mock('../data/playlist-mutations.js', () => ({
  useCreatePlaylistMutation: createMutationHook,
  useReorderPlaylistsMutation: reorderMutationHook,
  useDeletePlaylistMutation: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(async () => {}) }),
}))

const { PlaylistsView } = await import('../widgets/PlaylistsView.js')
const { useToastStore, toast } = await import('../../../shared/ui/toast-store.js')

function makePlaylist(id: number, over: Partial<Playlist> = {}): Playlist {
  return {
    id,
    type: 'normal',
    name: `Playlist ${id}`,
    description: undefined,
    coverUrl: undefined,
    labels: [],
    songCount: 0,
    sortBy: 'position',
    sortOrder: 'asc',
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

afterEach(() => {
  vi.clearAllMocks()
  toast.clear()
})

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

test('shows a built-in badge only on built-in playlists', async () => {
  listHook.mockReturnValue(
    listResult([
      {
        playlists: [
          makePlaylist(1, { name: 'Favorites', isBuiltIn: true }),
          makePlaylist(2, { name: 'Chill', isBuiltIn: false }),
        ],
        total: 2,
      },
    ]),
  )
  const { queryByTestId } = await renderView()

  expect(queryByTestId('playlist-card-builtin-1')).toBeInTheDocument()
  expect(queryByTestId('playlist-card-builtin-2')).not.toBeInTheDocument()
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

test('entering sort mode via the sort menu shows playlist names and a done button', async () => {
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
    fireEvent.tap(queryByTestId('playlists-sort-menu')!)
    await Promise.resolve()
  })
  await act(async () => {
    fireEvent.tap(queryByText('Manual sort')!)
    await Promise.resolve()
  })
  expect(queryByText('Favorites')).toBeInTheDocument()
  expect(queryByText('Chill')).toBeInTheDocument()
  expect(queryByText('Done')).toBeInTheDocument()
})

test('sort mode renders drag handles for each playlist', async () => {
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
    fireEvent.tap(queryByTestId('playlists-sort-menu')!)
    await Promise.resolve()
  })
  await act(async () => {
    fireEvent.tap(queryByText('Manual sort')!)
    await Promise.resolve()
  })
  expect(queryByTestId('playlists-drag-1')).toBeInTheDocument()
  expect(queryByTestId('playlists-drag-2')).toBeInTheDocument()
})

test('sort menu opens when the sort button is tapped', async () => {
  listHook.mockReturnValue(
    listResult([
      {
        playlists: [
          makePlaylist(1, { name: 'A' }),
          makePlaylist(2, { name: 'B' }),
        ],
        total: 2,
      },
    ]),
  )
  const { queryByTestId, queryByText } = await renderView()
  await act(async () => {
    fireEvent.tap(queryByTestId('playlists-sort-menu')!)
    await Promise.resolve()
  })
  expect(queryByText('Sort by name A→Z')).toBeInTheDocument()
  expect(queryByText('Sort by name Z→A')).toBeInTheDocument()
  expect(queryByText('Sort by number prefix')).toBeInTheDocument()
  expect(queryByText('Manual sort')).toBeInTheDocument()
})

test('name ascending sort calls reorder with sorted ids (case-insensitive)', async () => {
  const mutate = vi.fn()
  reorderMutationHook.mockReturnValue({ mutate, isPending: false })
  listHook.mockReturnValue(
    listResult([
      {
        playlists: [
          makePlaylist(1, { name: 'banana' }),
          makePlaylist(2, { name: 'Apple' }),
          makePlaylist(3, { name: 'cherry' }),
        ],
        total: 3,
      },
    ], { fetchNextPage: vi.fn().mockResolvedValue({ hasNextPage: false, data: { pages: [{ playlists: [makePlaylist(1, { name: 'banana' }), makePlaylist(2, { name: 'Apple' }), makePlaylist(3, { name: 'cherry' })], total: 3 }] } }) }),
  )
  const { queryByTestId, queryByText } = await renderView()
  await act(async () => {
    fireEvent.tap(queryByTestId('playlists-sort-menu')!)
    await Promise.resolve()
  })
  await act(async () => {
    fireEvent.tap(queryByText('Sort by name A→Z')!)
    await Promise.resolve()
  })
  expect(mutate).toHaveBeenCalledWith([2, 1, 3], expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) }))
})

test('already-sorted playlists shows the already-sorted banner', async () => {
  const mutate = vi.fn()
  reorderMutationHook.mockReturnValue({ mutate, isPending: false })
  listHook.mockReturnValue(
    listResult([
      {
        playlists: [
          makePlaylist(1, { name: 'Apple' }),
          makePlaylist(2, { name: 'Banana' }),
        ],
        total: 2,
      },
    ], { fetchNextPage: vi.fn().mockResolvedValue({ hasNextPage: false, data: { pages: [{ playlists: [makePlaylist(1, { name: 'Apple' }), makePlaylist(2, { name: 'Banana' })], total: 2 }] } }) }),
  )
  const { queryByTestId, queryByText } = await renderView()
  await act(async () => {
    fireEvent.tap(queryByTestId('playlists-sort-menu')!)
    await Promise.resolve()
  })
  await act(async () => {
    fireEvent.tap(queryByText('Sort by name A→Z')!)
    await Promise.resolve()
  })
  expect(mutate).not.toHaveBeenCalled()
  // The already-sorted notice is now the global toast (rendered by `ToastHost`),
  // so assert on the stored toast rather than an inline banner.
  const shown = useToastStore.getState().toast
  expect(shown).not.toBeNull()
  expect(shown?.tone).toBe('success')
  expect(shown?.text).toBe('Playlists already in this order')
})
