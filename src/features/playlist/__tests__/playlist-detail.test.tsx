import '../../../shims/router-env.js'

import '@testing-library/jest-dom'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { act, fireEvent, getQueriesForElement, render } from '@lynx-js/react/testing-library'

import type { Playlist } from '../../../models/playlist.js'
import type { Song } from '../../../models/song.js'
import { PlaylistApi } from '../api/index.js'
import { usePlayerStore } from '../../player/store/index.js'

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
const rowRenders = vi.hoisted(() => vi.fn())
const sortable = vi.hoisted(() => ({ onSortEnd: undefined as ((items: Array<{ dataItem: Song; getSortingKey: () => string }>) => void) | undefined, props: {} as Record<string, unknown> }))
const listEvents = vi.hoisted(() => ({ onEndReached: undefined as (() => void) | undefined }))
const cache = vi.hoisted(() => ({ available: false, beginSongs: vi.fn(), beginPlaylist: vi.fn() }))
vi.mock('../../player/data/indexed-song-cache.js', async () => ({
  ...await vi.importActual('../../player/data/indexed-song-cache.js'), indexedSongCacheAvailable: () => cache.available,
}))
vi.mock('../../player/widgets/use-cache-batch.js', () => ({
  useCacheBatchSubmission: () => ({ beginSongs: cache.beginSongs, beginPlaylist: cache.beginPlaylist, busy: false, confirmation: null }),
}))

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

vi.mock('@lynx-js/lynx-ui-sortable', async () => {
  const mocks = (await import('../../../__tests__/_render-mocks.js')).mockLynxUiSortable()
  return { ...mocks, SortableRoot: (props: Parameters<typeof mocks.SortableRoot>[0] & { onSortEnd: typeof sortable.onSortEnd }) => {
    sortable.onSortEnd = props.onSortEnd
    sortable.props = props
    return <mocks.SortableRoot {...props} />
  } }
})

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
  useAddSongsMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))

/*
 * The picker owns its queries and has a test of its own; here only the page's
 * entry wiring matters — which entry opens it and what playlist context it
 * receives.
 */
vi.mock('../widgets/AddSongsToPlaylistSheet.js', () => ({
  AddSongsToPlaylistSheet: ({ playlistId, playlistType }: {
    playlistId: number
    playlistType: string
  }) => (
    <view data-testid='add-songs-sheet-stub'>
      <text>{`${playlistId}:${playlistType}`}</text>
    </view>
  ),
}))

vi.mock('../../library/widgets/VirtualList.js', async () => {
  const { VirtualList } = (await import('../../../__tests__/_render-mocks.js')).mockVirtualList()
  return {
    VirtualList: (props: Parameters<typeof VirtualList>[0] & { onEndReached?: () => void }) => {
      listEvents.onEndReached = props.onEndReached
      return <VirtualList {...props} />
    },
  }
})

/*
 * Song rows mocked down to the plain `SongRow` — the menu / favorite /
 * responsive wiring has its own test file (`song-list-row.test.tsx`) and would
 * drag the favorites query + player store into this file's mocks.
 */
vi.mock('../../library/widgets/SongListRow.js', async () => {
  const { SongRow } = await import('../../library/widgets/SongRow.js')
  return { SongListRow: (props: Parameters<typeof SongRow>[0]) => {
    rowRenders(props.song.id)
    return <SongRow {...props} />
  } }
})

const { PlaylistDetailPage } = await import('../pages/PlaylistDetailPage.js')

test('playlist rows preserve numbers and show an initial only at each group boundary', async () => {
  songsHook.mockReturnValue({ data: { pages: [{ songs: [makeSong(1, { title: '夜曲' }), makeSong(2, { title: '夜空' }), makeSong(3, { title: '大城小爱' })], total: 3 }] } })
  render(<PlaylistDetailPage />)
  await act(async () => { await Promise.resolve() })
  const initials = Array.from(elementTree.root!.querySelectorAll('.song-row__initial')).map(node => node.textContent)
  const numbers = Array.from(elementTree.root!.querySelectorAll('.song-row__number')).map(node => node.textContent)
  expect(initials).toEqual(['Y', 'D'])
  expect(numbers).toEqual(['1', '2', '3'])
})

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
    remoteCount: 0,
    hasRemoteSongs: false,
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
  listEvents.onEndReached = undefined
  cache.available = false
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

test('overlapping list-end and seek pagination signals reuse the active page request', async () => {
  const fetchNextPage = vi.fn()
  songsHook.mockReturnValue(songsResult([{ songs: [makeSong(1)], total: 130 }], {
    hasNextPage: true, fetchNextPage,
  }))
  await renderPage()
  expect(listEvents.onEndReached).toBeTypeOf('function')
  listEvents.onEndReached!()
  listEvents.onEndReached!()
  expect(fetchNextPage.mock.calls).toEqual([
    [{ cancelRefetch: false }],
    [{ cancelRefetch: false }],
  ])
})

test('loading more keeps the bottom inset around the loading indicator', async () => {
  const pages = [{ songs: [makeSong(1)], total: 130 }]
  songsHook.mockReturnValue(songsResult(pages, { isFetchingNextPage: true }))
  const view = render(<PlaylistDetailPage />)
  await act(async () => { await Promise.resolve() })
  const loading = view.container.querySelector('.playlist-detail__footer')!
  expect(loading.parentElement).toHaveClass('playlist-detail__nav-inset')
  const inset = loading.parentElement
  songsHook.mockReturnValue(songsResult(pages))
  view.rerender(<PlaylistDetailPage />)
  expect(view.container.querySelector('.playlist-detail__nav-inset')).toBe(inset)
  expect(view.container.querySelector('.playlist-detail__footer')).toBeNull()
})

test('appending a page reuses old rows while their clicks play the latest loaded songs', async () => {
  const first = [makeSong(1), makeSong(2)]
  songsHook.mockReturnValue(songsResult([{ songs: first, total: 3 }]))
  const view = render(<PlaylistDetailPage />)
  await act(async () => { await Promise.resolve() })
  rowRenders.mockClear()
  const last = makeSong(3)
  songsHook.mockReturnValue(songsResult([{ songs: first, total: 3 }, { songs: [last], total: 3 }]))
  view.rerender(<PlaylistDetailPage />)
  await act(async () => { await Promise.resolve() })
  expect(rowRenders.mock.calls).toEqual([[3]])
  const play = vi.spyOn(usePlayerStore.getState(), 'playPlaylist').mockResolvedValue()
  try {
    await act(async () => { fireEvent.tap(view.container.querySelector('.song-row')!) })
    expect(play).toHaveBeenCalledWith([...first, last], 0, { type: 'playlist', key: '7' })
  } finally { play.mockRestore() }
})

test('whole-playlist caching submits the playlist identity instead of its currently loaded songs', async () => {
  cache.available = true
  songsHook.mockReturnValue(songsResult([{ songs: [makeSong(1)], total: 235 }]))
  const { getAllByTestId, getByTestId } = await renderPage()
  await act(async () => { fireEvent.tap(getAllByTestId('popover-trigger')[0]) })
  await act(async () => { fireEvent.tap(getByTestId('popover-item-cache')) })
  expect(cache.beginPlaylist).toHaveBeenCalledExactlyOnceWith(7)
  expect(cache.beginSongs).not.toHaveBeenCalled()
})

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

test.each(['normal', 'radio'] as const)('built-in %s playlist offers manual sorting while retaining identity guards', async (type) => {
  detailHook.mockReturnValue(detailResult(makePlaylist({ isBuiltIn: true, type })))
  songsHook.mockReturnValue(songsResult([{ songs: [makeSong(1), makeSong(2)], total: 2 }]))
  const queries = await renderPage()
  await openMoreMenu(queries)

  expect(queries.queryByTestId('popover-item-pin')).toBeInTheDocument()
  // Adding songs is allowed for built-ins too — Favorites is a destination.
  expect(queries.queryByTestId('popover-item-addSongs')).toBeInTheDocument()
  expect(queries.queryByTestId('popover-item-sort')).toBeInTheDocument()
  expect(queries.queryByTestId('popover-item-edit')).not.toBeInTheDocument()
  expect(queries.queryByTestId('popover-item-visibility')).not.toBeInTheDocument()
  expect(queries.queryByTestId('popover-item-delete')).not.toBeInTheDocument()
  await act(async () => {
    fireEvent.tap(queries.getByTestId('popover-item-sort')!, {})
    await Promise.resolve()
  })
  expect(queries.queryByTestId('playlist-detail-drag-1')).toBeInTheDocument()
  expect(queries.queryByTestId('playlist-detail-drag-2')).toBeInTheDocument()
})

test('the toolbar add entry opens the picker for this playlist', async () => {
  songsHook.mockReturnValue(songsResult([{ songs: [makeSong(1)], total: 1 }]))
  const queries = await renderPage()

  expect(queries.queryByTestId('add-songs-sheet-stub')).not.toBeInTheDocument()
  fireEvent.tap(queries.getByTestId('playlist-toolbar-add'), {})
  await act(async () => { await Promise.resolve() })

  expect(queries.getByText('7:normal')).toBeInTheDocument()
})

test('the more menu add entry opens the picker and passes the playlist type', async () => {
  detailHook.mockReturnValue(detailResult(makePlaylist({ type: 'radio' })))
  const queries = await renderPage()
  await openMoreMenu(queries)

  fireEvent.tap(queries.getByTestId('popover-item-addSongs')!, {})
  await act(async () => { await Promise.resolve() })

  expect(queries.getByText('7:radio')).toBeInTheDocument()
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

test('permanent ordering waits for confirmation and submits a server action', async () => {
  const sort = vi.spyOn(PlaylistApi.prototype, 'sortPlaylistSongs').mockResolvedValue(undefined)
  songsHook.mockReturnValue(songsResult([{ songs: [makeSong(1), makeSong(2)], total: 2 }]))
  const queries = await renderPage()
  await openMoreMenu(queries)
  fireEvent.tap(queries.getByTestId('popover-item-permanent_number_prefix'), {})
  await act(async () => { await Promise.resolve() })
  expect(sort).not.toHaveBeenCalled()
  expect(queries.getByTestId('playlist-permanent-sort-dialog')).toBeInTheDocument()
  fireEvent.tap(queries.getByTestId('playlist-permanent-sort-confirm'), {})
  await act(async () => { await Promise.resolve() })
  expect(sort).toHaveBeenCalledWith(7, 'number_prefix')
  expect(queries.queryByTestId('playlist-permanent-sort-dialog')).not.toBeInTheDocument()
  sort.mockRestore()
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

test('entering manual sorting switches the saved view to custom ascending order', async () => {
  detailHook.mockReturnValue(detailResult(makePlaylist({ sortBy: 'title', sortOrder: 'desc', isBuiltIn: true })))
  songsHook.mockReturnValue(songsResult([{ songs: [makeSong(1), makeSong(2)], total: 2 }]))
  const queries = await renderPage()
  await openMoreMenu(queries)
  await act(async () => { fireEvent.tap(queries.getByTestId('popover-item-sort')!, {}) })
  expect(sortMutationHook.mock.results[0]!.value.mutate).toHaveBeenCalledWith(
    { sortBy: 'position', sortOrder: 'asc' }, expect.objectContaining({ onSuccess: expect.any(Function) }),
  )
  expect(queries.queryByTestId('playlist-detail-drag-1')).not.toBeInTheDocument()
})

test('sort mode owns its auto-scroll boundary and preserves pagination and footer', async () => {
  const fetchNextPage = vi.fn()
  songsHook.mockReturnValue(songsResult([{ songs: [makeSong(1), makeSong(2)], total: 80 }], { hasNextPage: true, fetchNextPage }))
  const queries = await renderPage()
  await openMoreMenu(queries)
  await act(async () => { fireEvent.tap(queries.getByTestId('popover-item-sort')!, {}) })
  expect(sortable.props.as).toBe('ScrollView')
  expect(sortable.props.scrollableBoundaryId).toBe('playlist-detail-sort-scroll')
  expect(sortable.props.scrollableClassName).toBe('playlist-detail__sort-scroll')
  expect(sortable.props.scrollableFooter).toBeTruthy()
  const scrollProps = sortable.props.scrollableProps as { bindscroll: unknown; bindscrolltolower: () => void; 'lower-threshold': number }
  expect(scrollProps.bindscroll).toBeTypeOf('function')
  expect(scrollProps['lower-threshold']).toBe(200)
  await act(async () => { scrollProps.bindscrolltolower() })
  expect(fetchNextPage).toHaveBeenCalledWith({ cancelRefetch: false })
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

  for (const id of [1, 2]) {
    expect(queries.queryByTestId(`playlist-detail-drag-${id}`)).toHaveAttribute('consume-slide-event', '[[-180,180]]')
  }
  expect(elementTree.root!.querySelectorAll('[consume-slide-event]')).toHaveLength(2)
  expect(queries.queryByTestId('playlist-detail-drag-1')).toBeInTheDocument()
  expect(queries.queryByTestId('playlist-detail-drag-2')).toBeInTheDocument()
})

test.each([
  { order: [2, 3, 1], move: { songId: 1, afterSongId: 3 } },
  { order: [3, 1, 2], move: { songId: 3, afterSongId: null } },
])('dragging across multiple rows persists the entire intended order $order', async ({ order, move }) => {
  songsHook.mockReturnValue(songsResult([{ songs: [makeSong(1), makeSong(2), makeSong(3)], total: 3 }]))
  const queries = await renderPage()
  await openMoreMenu(queries)
  await act(async () => { fireEvent.tap(queries.getByTestId('popover-item-sort')!, {}) })
  await act(async () => {
    sortable.onSortEnd!(order.map(id => ({ dataItem: makeSong(id), getSortingKey: () => String(id) })))
  })
  expect(moveSongMutationHook.mock.results[0]!.value.mutate).toHaveBeenCalledWith(move)
})
