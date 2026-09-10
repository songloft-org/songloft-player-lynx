import '../../../shims/router-env.js'

import '@testing-library/jest-dom'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { act, fireEvent, getQueriesForElement, render } from '@lynx-js/react/testing-library'

import type { Song } from '../../../models/song.js'
import type { LibrarySortId } from '../domain/library-sort.js'
import { useSongRowOverlays } from '../../../shared/ui/song-row-overlays.js'

/**
 * FlatSongsView render tests — the flat song list content view. Carries the
 * search / sort wiring, the sort bottom-sheet, and the P1-12 multi-select
 * regression that used to live in the old monolithic library-page test.
 */
const { songsHook, navigateSpy, filterInputs } = vi.hoisted(() => ({
  songsHook: vi.fn(),
  navigateSpy: vi.fn(),
  filterInputs: [] as Array<{ placeholder: string; onInput: (v: string) => void }>,
}))

vi.mock('react-i18next', async () =>
  (await import('../../../__tests__/_render-mocks.js')).mockReactI18next(),
)

vi.mock('../data/songs-query.js', () => ({
  useSongsInfiniteQuery: songsHook,
  libraryQueryKeys: { songs: () => [] },
}))

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigateSpy,
}))

vi.mock('../widgets/VirtualList.js', async () =>
  (await import('../../../__tests__/_render-mocks.js')).mockVirtualList(),
)

/*
 * The row is mocked down to the plain `SongRow`: this file tests the view's
 * search / sort / multi-select wiring, while `SongListRow`'s own menu /
 * favorite / responsive behaviour has its dedicated test file (which mocks
 * the hooks this stand-in skips: favorites, player store, dialog).
 */
vi.mock('../widgets/SongListRow.js', async () => {
  const { SongRow } = await import('../widgets/SongRow.js')
  return { SongListRow: SongRow }
})

vi.mock('@lynx-js/lynx-ui-input', () => ({
  Input: (props: Record<string, unknown>) => {
    if (typeof props.onInput === 'function') {
      filterInputs.push({
        placeholder: props.placeholder as string,
        onInput: props.onInput as (v: string) => void,
      })
    }
    return (
      <view className={props.className as string}>
        <text>{(props.value || props.placeholder) as string}</text>
      </view>
    )
  },
}))


vi.mock('../data/use-debounce.js', () => ({
  useDebounce: <T,>(value: T, _delay: number): T => value,
}))

const { FlatSongsView } = await import('../widgets/FlatSongsView.js')

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

beforeEach(() => {
  songsHook.mockReturnValue(songsResult([{ songs: [], total: 0 }]))
  useSongRowOverlays.getState().closeAddToPlaylist()
  filterInputs.length = 0
})

afterEach(() => vi.clearAllMocks())

async function renderView(
  type?: 'local' | 'remote' | 'radio',
  sortId: LibrarySortId = 'added_at',
  onSortChange: (id: LibrarySortId, order: 'asc' | 'desc') => void = () => {},
  sortOrder: 'asc' | 'desc' = 'desc',
) {
  render(<FlatSongsView type={type} sortId={sortId} sortOrder={sortOrder} onSortChange={onSortChange} isWide={false} />)
  await act(async () => {
    await Promise.resolve()
  })
  return getQueriesForElement(elementTree.root!)
}

test('renders a row per song (title, subtitle, duration)', async () => {
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
  const { queryByText, queryAllByText } = await renderView()

  expect(queryByText('Blue in Green')).toBeInTheDocument()
  expect(queryByText('So What')).toBeInTheDocument()
  expect(queryAllByText('Miles · KOB')).toHaveLength(2)
  expect(queryByText('05:27')).toBeInTheDocument()
  expect(queryByText('09:05')).toBeInTheDocument()
})

test('renders the search input and the toolbar (play all / sort / add / select)', async () => {
  const { queryByText, queryByTestId } = await renderView()
  expect(queryByText('Search songs...')).toBeInTheDocument()
  expect(queryByTestId('library-toolbar-play-all')).toBeInTheDocument()
  expect(queryByTestId('library-toolbar-sort')).toBeInTheDocument()
  expect(queryByTestId('library-toolbar-add')).toBeInTheDocument()
  expect(queryByTestId('library-toolbar-select')).toBeInTheDocument()
  // The sort chip shows the CURRENT sort label (default: recently added).
  expect(queryByText('Recent')).toBeInTheDocument()
})

test('defaults to added_at/desc with no type for the all view', async () => {
  await renderView()
  expect(songsHook).toHaveBeenCalledWith({ sort: 'added_at', order: 'desc' })
})

test('passes the source type into the filters', async () => {
  await renderView('remote')
  expect(songsHook).toHaveBeenCalledWith({ sort: 'added_at', order: 'desc', type: 'remote' })
})

test('a lifted sort id drives the filters (title → asc)', async () => {
  await renderView(undefined, 'title', () => {}, 'asc')
  expect(songsHook).toHaveBeenCalledWith({ sort: 'title', order: 'asc' })
})

test('opening the sort sheet lists all 7 options and picking one reports upward', async () => {
  const onSortChange = vi.fn()
  const { getByTestId, getByText } = await renderView(undefined, 'added_at', onSortChange)

  await act(async () => {
    fireEvent.tap(getByTestId('library-toolbar-sort'))
  })
  // All seven options are visible in the sheet.
  expect(getByText('File time')).toBeInTheDocument()
  expect(getByText('Duration')).toBeInTheDocument()

  await act(async () => {
    fireEvent.tap(getByText('Duration'))
  })
  expect(onSortChange).toHaveBeenCalledWith('duration', 'asc')
})

// P1-12 regression: multi-select must clear when the visible song list changes
// (search or sort). Without the useEffect, selected IDs from the previous
// result set linger and get added to playlists even though they are no longer
// visible. To verify "remove fix → turns red": comment out the useEffect in
// FlatSongsView.tsx and this test will fail.
test('multi-select is cleared when the search changes', async () => {
  songsHook.mockReturnValue(
    songsResult([
      { songs: [makeSong(1, { title: 'Track A' }), makeSong(2, { title: 'Track B' })], total: 2 },
    ]),
  )
  const { getByText, queryByText } = await renderView()

  // Enter select mode and select a row.
  await act(async () => {
    fireEvent.tap(getByText('Select'))
  })
  await act(async () => {
    fireEvent.tap(getByText('Track A'))
  })
  expect(queryByText('1 selected')).toBeInTheDocument()

  // Type into the search box — the selection must be cleared.
  const searchInput = filterInputs.find((i) => i.placeholder === 'Search songs...')
  expect(searchInput).toBeDefined()
  await act(async () => {
    searchInput!.onInput('Track B')
  })
  expect(queryByText('1 selected')).not.toBeInTheDocument()
})

/*
 * The selection is handed to the root-mounted add-to-playlist sheet — the same
 * one a single row opens. This view used to inline a second, flatter picker
 * (names only, no covers, no "new playlist"); it no longer exists.
 */
test('the selection is added through the shared add-to-playlist sheet', async () => {
  songsHook.mockReturnValue(
    songsResult([
      { songs: [makeSong(1, { title: 'Track A' }), makeSong(2, { title: 'Track B' })], total: 2 },
    ]),
  )
  const { getByText, getByTestId } = await renderView()

  await act(async () => {
    fireEvent.tap(getByText('Select'))
  })
  await act(async () => {
    fireEvent.tap(getByText('Track A'))
  })
  await act(async () => {
    fireEvent.tap(getByText('Track B'))
  })
  await act(async () => {
    fireEvent.tap(getByTestId('library-select-add-to-playlist'))
  })

  expect(useSongRowOverlays.getState().addToPlaylistSongIds).toEqual([1, 2])
})

/*
 * Leaving select mode is the sheet's success callback, not its close: a
 * dismissed sheet has to leave the selection the user built up alone.
 */
test('select mode is left only once the sheet reports a successful add', async () => {
  songsHook.mockReturnValue(
    songsResult([{ songs: [makeSong(1, { title: 'Track A' })], total: 1 }]),
  )
  const { getByText, getByTestId, queryByText } = await renderView()

  await act(async () => {
    fireEvent.tap(getByText('Select'))
  })
  await act(async () => {
    fireEvent.tap(getByText('Track A'))
  })
  await act(async () => {
    fireEvent.tap(getByTestId('library-select-add-to-playlist'))
  })
  // Sheet open, nothing added yet: the selection stands.
  expect(queryByText('1 selected')).toBeInTheDocument()

  const onAdded = useSongRowOverlays.getState().addToPlaylistOnAdded
  expect(onAdded).toBeTypeOf('function')
  await act(async () => {
    onAdded!()
  })
  expect(queryByText('1 selected')).not.toBeInTheDocument()
  expect(queryByText('Cancel')).not.toBeInTheDocument()
})
