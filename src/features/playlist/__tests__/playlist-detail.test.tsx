import '../../../shims/router-env.js'

import '@testing-library/jest-dom'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { act, fireEvent, getQueriesForElement, render } from '@lynx-js/react/testing-library'

import type { Playlist } from '../../../models/playlist.js'
import type { Song } from '../../../models/song.js'

const { detailHook, songsHook, deleteMutationHook, updateMutationHook, removeSongMutationHook, moveSongMutationHook, visibilityMutationHook, pinnedMutationHook, sortMutationHook } = vi.hoisted(() => ({
  detailHook: vi.fn(),
  songsHook: vi.fn(),
  deleteMutationHook: vi.fn(),
  updateMutationHook: vi.fn(),
  removeSongMutationHook: vi.fn(),
  moveSongMutationHook: vi.fn(),
  visibilityMutationHook: vi.fn(),
  pinnedMutationHook: vi.fn(),
  sortMutationHook: vi.fn(),
}))

const navigateMock = vi.hoisted(() => vi.fn())

vi.mock('react-i18next', async () =>
  (await import('../../../__tests__/_render-mocks.js')).mockReactI18next(),
)

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigateMock,
  useParams: () => ({ id: '7' }),
}))

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useInfiniteQuery: () => ({ data: undefined, isLoading: false }),
  // Used by the play-history panel this page can open.
  useQuery: () => ({ data: { items: [], total: 0 }, isLoading: false, isError: false, refetch: vi.fn() }),
}))

vi.mock('@lynx-js/lynx-ui-input', async () =>
  (await import('../../../__tests__/_render-mocks.js')).mockLynxUiInput(),
)

vi.mock('@lynx-js/lynx-ui-sortable', async () =>
  (await import('../../../__tests__/_render-mocks.js')).mockLynxUiSortable(),
)

vi.mock('@lynx-js/lynx-ui-dialog', () => ({
  DialogRoot: ({ children, show }: { children: unknown; show: boolean }) => (show ? <view>{children as never}</view> : null),
  DialogView: ({ children }: { children: unknown }) => <view>{children as never}</view>,
  DialogBackdrop: ({ children }: { children: unknown }) => <view>{children as never}</view>,
  DialogContent: ({ children }: { children: unknown }) => <view>{children as never}</view>,
  DialogClose: ({ children }: { children: unknown }) => <view>{children as never}</view>,
}))

/*
 * Component-level PopoverMenu stand-in: both the page's more-menu and the
 * toolbar's sort dropdown render through it, and the contract under test is the
 * props the page passes (items, onSelect) — not lynx-ui's Presence behaviour,
 * which `overlay-back-contract.test.tsx` covers separately.
 */
vi.mock('../../../shared/ui/PopoverMenu.js', () => ({
  PopoverMenu: ({ show, items, trigger, onSelect, onShowChange }: {
    show: boolean
    items: Array<{ key: string; label: string }>
    trigger: unknown
    onSelect: (key: string) => void
    onShowChange: (show: boolean) => void
  }) => (
    <view>
      <view data-testid='popover-trigger' bindtap={() => onShowChange(!show)}>
        {trigger as never}
      </view>
      {show
        ? items.map((item) => (
          <view key={item.key} data-testid={`popover-item-${item.key}`} bindtap={() => onSelect(item.key)}>
            <text>{item.label}</text>
          </view>
        ))
        : null}
    </view>
  ),
}))

vi.mock('../data/playlist-query.js', () => ({
  usePlaylistQuery: detailHook,
  usePlaylistSongsInfiniteQuery: songsHook,
  playlistQueryKeys: { detail: () => [], songs: () => [] },
}))

vi.mock('../data/playlist-mutations.js', () => ({
  useDeletePlaylistMutation: deleteMutationHook,
  useUpdatePlaylistMutation: updateMutationHook,
  useRemoveSongMutation: removeSongMutationHook,
  useMoveSongMutation: moveSongMutationHook,
  useSetVisibilityMutation: visibilityMutationHook,
  useSetPinnedMutation: pinnedMutationHook,
  useUpdateSortMutation: sortMutationHook,
}))

vi.mock('../../library/widgets/VirtualList.js', async () =>
  (await import('../../../__tests__/_render-mocks.js')).mockVirtualList(),
)

/*
 * Song rows mocked down to the plain `SongRow` — the menu / favorite /
 * responsive wiring has its own test file (`song-list-row.test.tsx`) and would
 * drag the favorites query + player store into this file's mocks.
 */
vi.mock('../../library/widgets/SongListRow.js', async () => {
  const { SongRow } = await import('../../library/widgets/SongRow.js')
  return { SongListRow: SongRow }
})

const { PlaylistDetailPage } = await import('../pages/PlaylistDetailPage.js')

function makeSong(id: number, over: Partial<Song> = {}): Song {
  return {
    id,
    type: 'local',
    title: `Song ${id}`,
    artist: `Artist ${id}`,
    album: `Album ${id}`,
    year: 0,
    genre: undefined,
    language: undefined,
    style: undefined,
    duration: 0,
    filePath: undefined,
    url: undefined,
    coverUrl: undefined,
    lyricUrl: undefined,
    lyricRemoteUrl: undefined,
    fileSize: 0,
    format: undefined,
    bitRate: 0,
    sampleRate: 0,
    sourceUrl: undefined,
    sourceCoverUrl: undefined,
    isLive: false,
    isVideo: false,
    addedAt: '',
    updatedAt: '',
    ...over,
  }
}

function makePlaylist(over: Partial<Playlist> = {}): Playlist {
  return {
    id: 7,
    type: 'normal',
    name: 'Road Trip',
    description: undefined,
    coverUrl: undefined,
    labels: [],
    songCount: 2,
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

function detailResult(data: Playlist | undefined, over = {}) {
  return { data, isLoading: false, isError: false, ...over }
}

function songsResult(pages: { songs: Song[]; total: number }[], over = {}) {
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
  return { mutate: vi.fn(), isPending: false, ...over }
}

beforeEach(() => {
  detailHook.mockReturnValue(detailResult(makePlaylist()))
  songsHook.mockReturnValue(songsResult([{ songs: [], total: 0 }]))
  deleteMutationHook.mockReturnValue(mutationResult())
  updateMutationHook.mockReturnValue(mutationResult())
  removeSongMutationHook.mockReturnValue(mutationResult())
  moveSongMutationHook.mockReturnValue(mutationResult())
  visibilityMutationHook.mockReturnValue(mutationResult())
  pinnedMutationHook.mockReturnValue(mutationResult())
  sortMutationHook.mockReturnValue(mutationResult())
})

afterEach(() => vi.clearAllMocks())

async function renderPage() {
  render(<PlaylistDetailPage />)
  await act(async () => {
    await Promise.resolve()
  })
  return getQueriesForElement(elementTree.root!)
}

async function openMoreMenu(queries: ReturnType<typeof getQueriesForElement>) {
  // The page renders one popover (more-menu) when it has songs — the toolbar's
  // sort dropdown is a second popover, so queries must be position-aware.
  const triggers = queries.queryAllByTestId('popover-trigger')
  fireEvent.tap(triggers[0]!, {})
  await act(async () => { await Promise.resolve() })
}

test('renders the header (name, description, song count) and a row per song', async () => {
  detailHook.mockReturnValue(
    detailResult(makePlaylist({ description: 'For the drive', songCount: 2 })),
  )
  songsHook.mockReturnValue(
    songsResult([
      {
        songs: [
          makeSong(1, { title: 'Blue in Green', artist: 'Miles', album: 'KOB', duration: 327 }),
          makeSong(2, { title: 'So What', artist: 'Miles', album: 'KOB', duration: 545 }),
        ],
        total: 2,
      },
    ]),
  )
  const { queryByText, queryAllByText } = await renderPage()

  expect(queryByText('Road Trip')).toBeInTheDocument()
  expect(queryByText('For the drive')).toBeInTheDocument()
  expect(queryByText('2 songs')).toBeInTheDocument()

  expect(queryByText('Blue in Green')).toBeInTheDocument()
  expect(queryByText('So What')).toBeInTheDocument()
  expect(queryAllByText('Miles · KOB')).toHaveLength(2)
  expect(queryByText('05:27')).toBeInTheDocument()
  expect(queryByText('09:05')).toBeInTheDocument()
})

test('shows the empty state when the playlist has no songs', async () => {
  songsHook.mockReturnValue(songsResult([{ songs: [], total: 0 }]))
  const { queryByText } = await renderPage()
  expect(queryByText('No songs in this playlist')).toBeInTheDocument()
})

test('shows the loading state while songs load', async () => {
  songsHook.mockReturnValue(songsResult([], { isLoading: true, data: undefined }))
  const { queryByText } = await renderPage()
  expect(queryByText('Loading songs…')).toBeInTheDocument()
})

test('opens the description panel on tap and closes via the panel button', async () => {
  detailHook.mockReturnValue(
    detailResult(makePlaylist({ description: 'A very long description worth reading in full' })),
  )
  const { queryByTestId, getByTestId } = await renderPage()
  expect(queryByTestId('playlist-desc-panel')).not.toBeInTheDocument()

  fireEvent.tap(getByTestId('playlist-detail-desc'), {})
  await act(async () => { await Promise.resolve() })
  expect(queryByTestId('playlist-desc-panel')).toBeInTheDocument()

  fireEvent.tap(getByTestId('playlist-desc-close'), {})
  await act(async () => { await Promise.resolve() })
  expect(queryByTestId('playlist-desc-panel')).not.toBeInTheDocument()
})

test('more menu offers pin, edit and delete for non-built-in playlists', async () => {
  detailHook.mockReturnValue(detailResult(makePlaylist({ isBuiltIn: false })))
  const queries = await renderPage()
  await openMoreMenu(queries)

  expect(queries.queryByTestId('popover-item-pin')).toBeInTheDocument()
  expect(queries.queryByTestId('popover-item-edit')).toBeInTheDocument()
  expect(queries.queryByTestId('popover-item-visibility')).toBeInTheDocument()
  expect(queries.queryByTestId('popover-item-delete')).toBeInTheDocument()
})

test('more menu offers only pin for built-in playlists', async () => {
  // Pinning used to be impossible here: the whole menu was inside the
  // `!isBuiltIn` block. The backend deliberately skips its built-in guard for
  // the pin endpoint, so Favorites/Radio favorites get a menu holding just
  // that one item — edit/visibility/delete stay owner-playlists-only.
  detailHook.mockReturnValue(detailResult(makePlaylist({ isBuiltIn: true })))
  const queries = await renderPage()
  await openMoreMenu(queries)

  expect(queries.queryByTestId('popover-item-pin')).toBeInTheDocument()
  expect(queries.queryByTestId('popover-item-edit')).not.toBeInTheDocument()
  expect(queries.queryByTestId('popover-item-visibility')).not.toBeInTheDocument()
  expect(queries.queryByTestId('popover-item-delete')).not.toBeInTheDocument()
})

test('shows the play-history button for built-in playlists too', async () => {
  // The Flutter menu item is unconditional, and "Favorites" is exactly the
  // playlist a user replays from — so this must not live in the `!isBuiltIn`
  // block that hides the more menu.
  detailHook.mockReturnValue(detailResult(makePlaylist({ isBuiltIn: true })))
  const { queryByTestId } = await renderPage()
  expect(queryByTestId('playlist-detail-history')).toBeInTheDocument()
})

test('opens the play-history panel on tap', async () => {
  const { queryByTestId, getByTestId } = await renderPage()
  expect(queryByTestId('play-history-panel')).not.toBeInTheDocument()

  fireEvent.tap(getByTestId('playlist-detail-history'), {})
  await act(async () => { await Promise.resolve() })

  expect(queryByTestId('play-history-panel')).toBeInTheDocument()
})

test('edit menu item navigates to the edit page', async () => {
  const queries = await renderPage()
  await openMoreMenu(queries)

  fireEvent.tap(queries.getByTestId('popover-item-edit')!, {})
  await act(async () => { await Promise.resolve() })

  expect(navigateMock).toHaveBeenCalledWith({
    to: '/playlists/$id/edit',
    params: { id: '7' },
  })
})

test('delete menu item opens a confirm dialog; confirming fires the mutation', async () => {
  const queries = await renderPage()
  await openMoreMenu(queries)

  expect(queries.queryByTestId('playlist-delete-dialog')).not.toBeInTheDocument()
  fireEvent.tap(queries.getByTestId('popover-item-delete')!, {})
  await act(async () => { await Promise.resolve() })
  expect(queries.queryByTestId('playlist-delete-dialog')).toBeInTheDocument()

  fireEvent.tap(queries.getByTestId('playlist-delete-confirm')!, {})
  await act(async () => { await Promise.resolve() })
  expect(deleteMutationHook.mock.results[0]!.value.mutate).toHaveBeenCalledWith(7, expect.anything())
  expect(queries.queryByTestId('playlist-delete-dialog')).not.toBeInTheDocument()
})

test('the row-tail remove button asks for confirmation before removing the song', async () => {
  songsHook.mockReturnValue(
    songsResult([{ songs: [makeSong(11), makeSong(12)], total: 2 }]),
  )
  const queries = await renderPage()

  // The old row-tail × removed the song on the first tap.
  fireEvent.tap(queries.getAllByTestId('playlist-detail-remove')[0]!, {})
  await act(async () => { await Promise.resolve() })
  expect(removeSongMutationHook.mock.results[0]!.value.mutate).not.toHaveBeenCalled()
  expect(queries.queryByTestId('playlist-delete-dialog')).toBeInTheDocument()

  fireEvent.tap(queries.getByTestId('playlist-delete-confirm')!, {})
  await act(async () => { await Promise.resolve() })
  expect(removeSongMutationHook.mock.results[0]!.value.mutate).toHaveBeenCalledWith(11)
  expect(queries.queryByTestId('playlist-delete-dialog')).not.toBeInTheDocument()
})

test('visibility menu item fires the visibility mutation', async () => {
  const queries = await renderPage()
  await openMoreMenu(queries)

  fireEvent.tap(queries.getByTestId('popover-item-visibility')!, {})
  await act(async () => { await Promise.resolve() })

  expect(visibilityMutationHook.mock.results[0]!.value.mutate).toHaveBeenCalledWith({ id: 7, hidden: true })
})

test('pin menu item fires the pin mutation with the toggled value', async () => {
  const queries = await renderPage()
  await openMoreMenu(queries)

  fireEvent.tap(queries.getByTestId('popover-item-pin')!, {})
  await act(async () => { await Promise.resolve() })

  expect(pinnedMutationHook.mock.results[0]!.value.mutate).toHaveBeenCalledWith(
    { id: 7, pinned: true },
    expect.anything(),
  )
})

test('toolbar sort dropdown commits the chosen sort', async () => {
  songsHook.mockReturnValue(
    songsResult([{ songs: [makeSong(1), makeSong(2)], total: 2 }]),
  )
  const queries = await renderPage()

  // With songs present there are two popovers: the page more-menu and the
  // toolbar's sort dropdown. The toolbar's trigger shows the current sort label.
  const triggers = queries.queryAllByTestId('popover-trigger')
  expect(triggers.length).toBe(2)
  fireEvent.tap(triggers[1]!, {})
  await act(async () => { await Promise.resolve() })

  fireEvent.tap(queries.getByTestId('popover-item-title')!, {})
  await act(async () => { await Promise.resolve() })

  expect(sortMutationHook.mock.results[0]!.value.mutate).toHaveBeenCalledWith({ sortBy: 'title', sortOrder: 'asc' })
})

test('more menu offers manual reorder once all songs are loaded', async () => {
  songsHook.mockReturnValue(
    songsResult([{ songs: [makeSong(1), makeSong(2)], total: 2 }], { hasNextPage: false }),
  )
  const queries = await renderPage()
  await openMoreMenu(queries)
  expect(queries.queryByTestId('popover-item-sort')).toBeInTheDocument()
})

test('more menu offers manual reorder even while more pages remain unloaded', async () => {
  songsHook.mockReturnValue(
    songsResult([{ songs: [makeSong(1), makeSong(2)], total: 5 }], { hasNextPage: true }),
  )
  const queries = await renderPage()
  await openMoreMenu(queries)
  expect(queries.queryByTestId('popover-item-sort')).toBeInTheDocument()
})

test('sort mode renders drag handles for each song', async () => {
  songsHook.mockReturnValue(
    songsResult([{ songs: [makeSong(1), makeSong(2)], total: 2 }], { hasNextPage: false }),
  )
  const queries = await renderPage()
  await openMoreMenu(queries)

  await act(async () => {
    fireEvent.tap(queries.getByTestId('popover-item-sort')!, {})
    await Promise.resolve()
  })
  expect(queries.queryByTestId('playlist-detail-drag-1')).toBeInTheDocument()
  expect(queries.queryByTestId('playlist-detail-drag-2')).toBeInTheDocument()
})
