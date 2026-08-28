import '../../../shims/router-env.js'

import '@testing-library/jest-dom'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { act, fireEvent, getQueriesForElement, render } from '@lynx-js/react/testing-library'

import type { Playlist } from '../../../models/playlist.js'

const {
  listHook,
  createMutationHook,
  reorderMutationHook,
  deleteMutationHook,
  pinnedMutationHook,
  visibilityMutationHook,
} = vi.hoisted(() => ({
  listHook: vi.fn(),
  createMutationHook: vi.fn(),
  reorderMutationHook: vi.fn(),
  deleteMutationHook: vi.fn(),
  pinnedMutationHook: vi.fn(),
  visibilityMutationHook: vi.fn(),
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

// The batch-delete confirm dialog (`ConfirmDialog`) — same stand-in shape as
// `playlist-detail.test.tsx`.
vi.mock('@lynx-js/lynx-ui-dialog', () => ({
  DialogRoot: ({ children, show }: { children: unknown; show: boolean }) => (show ? <view>{children as never}</view> : null),
  DialogView: ({ children }: { children: unknown }) => <view>{children as never}</view>,
  DialogBackdrop: ({ children }: { children: unknown }) => <view>{children as never}</view>,
  DialogContent: ({ children }: { children: unknown }) => <view>{children as never}</view>,
  DialogClose: ({ children }: { children: unknown }) => <view>{children as never}</view>,
}))

vi.mock('../data/playlist-query.js', () => ({
  usePlaylistsInfiniteQuery: listHook,
  playlistQueryKeys: { list: () => [] },
}))

vi.mock('../data/playlist-mutations.js', () => ({
  useCreatePlaylistMutation: createMutationHook,
  useReorderPlaylistsMutation: reorderMutationHook,
  useDeletePlaylistMutation: deleteMutationHook,
  useSetPinnedMutation: pinnedMutationHook,
  useSetVisibilityMutation: visibilityMutationHook,
}))

vi.mock('../../library/data/song-tags-query.js', () => ({
  useFromPlaylistMutation: () => ({ mutate: vi.fn(), isPending: false }),
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
    pinnedAt: undefined,
    isPinned: false,
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
  deleteMutationHook.mockReturnValue({ mutate: vi.fn(), mutateAsync: vi.fn(async () => {}), isPending: false })
  pinnedMutationHook.mockReturnValue({ mutate: vi.fn(), mutateAsync: vi.fn(async () => {}), isPending: false })
  visibilityMutationHook.mockReturnValue({ mutate: vi.fn(), mutateAsync: vi.fn(async () => {}), isPending: false })
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

test('multi-select delete goes through a full-screen dialog before deleting', async () => {
  const mutateAsync = vi.fn(async () => {})
  deleteMutationHook.mockReturnValue({ mutate: vi.fn(), mutateAsync, isPending: false })
  listHook.mockReturnValue(
    listResult([{ playlists: [makePlaylist(1), makePlaylist(2, { isBuiltIn: true })], total: 2 }]),
  )
  const { queryByTestId, getByTestId, queryByText, getByText } = await renderView()

  // Enter multi-select and pick the (non-built-in) first playlist.
  await act(async () => {
    fireEvent.tap(getByTestId('playlists-select-toggle')!)
    await Promise.resolve()
  })
  await act(async () => {
    fireEvent.tap(getByText('Playlist 1')!)
    await Promise.resolve()
  })

  // The old behaviour armed the button itself (a relabelled chip on the bottom
  // toolbar); it must now open the centred dialog instead.
  expect(queryByTestId('playlists-delete-dialog')).not.toBeInTheDocument()
  expect(queryByText('Tap again to delete')).not.toBeInTheDocument()
  await act(async () => {
    fireEvent.tap(getByText('Delete')!)
    await Promise.resolve()
  })
  expect(queryByTestId('playlists-delete-dialog')).toBeInTheDocument()

  await act(async () => {
    fireEvent.tap(getByTestId('playlists-delete-confirm')!)
    await Promise.resolve()
  })
  // Only the selected, non-built-in playlist is deleted.
  expect(mutateAsync).toHaveBeenCalledTimes(1)
  expect(mutateAsync).toHaveBeenCalledWith(1)
  expect(queryByTestId('playlists-delete-dialog')).not.toBeInTheDocument()
})

test('shows a pinned chip only on pinned playlists', async () => {
  listHook.mockReturnValue(
    listResult([
      {
        playlists: [
          makePlaylist(1, { name: 'Favorites', isPinned: true }),
          makePlaylist(2, { name: 'Chill', isPinned: false }),
        ],
        total: 2,
      },
    ]),
  )
  const { queryByTestId } = await renderView()

  expect(queryByTestId('playlist-card-pinned-1')).toBeInTheDocument()
  expect(queryByTestId('playlist-card-pinned-2')).not.toBeInTheDocument()
})

/*
 * The `⋯` that opens the row menu is `catchtap` (so tapping it does not also
 * navigate into the playlist), and `fireEvent.tap` from the testing library does
 * not invoke `catchtap` handlers — only `bindtap` (confirmed empirically; same
 * gap as `playlist-drawer.test.tsx` documents). So opening the menu and acting
 * on its items is real-device/browser verified; here we assert the renderable
 * structure instead — that every card exposes a `⋯`, and that the menu's
 * built-in-vs-normal item split is exactly `playlistRowMenuKeys` (tested
 * directly in `playlist-row-menu.test.ts`). The pin / delete mutations
 * themselves are covered through the detail page's `bindtap` menu.
 */
test('every playlist card exposes a row-menu trigger', async () => {
  listHook.mockReturnValue(
    listResult([
      {
        playlists: [
          makePlaylist(1, { name: 'Favorites', isBuiltIn: true }),
          makePlaylist(2, { name: 'Chill' }),
        ],
        total: 2,
      },
    ]),
  )
  const { queryByTestId } = await renderView()

  expect(queryByTestId('playlist-card-more-1')).toBeInTheDocument()
  expect(queryByTestId('playlist-card-more-2')).toBeInTheDocument()
})
