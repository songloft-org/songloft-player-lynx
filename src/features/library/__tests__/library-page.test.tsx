import '../../../shims/router-env.js'

import '@testing-library/jest-dom'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import {
  act,
  fireEvent,
  getQueriesForElement,
  render,
} from '@lynx-js/react/testing-library'

import type { Song, SongFacet } from '../../../models/song.js'

const { songsHook, facetsHook, playlistsHook, navigateSpy, searchHook } = vi.hoisted(
  () => ({
    songsHook: vi.fn(),
    facetsHook: vi.fn(),
    playlistsHook: vi.fn(),
    navigateSpy: vi.fn(),
    searchHook: vi.fn(),
  }),
)

// Captured onInput callbacks from filter Inputs so tests can simulate typing.
// The default Input mock is a static placeholder — it never calls onInput.
// We capture the real handlers here so the regression test for P1-12 can
// trigger a filter change and assert the multi-select is cleared.
const { filterInputs } = vi.hoisted(() => ({
  filterInputs: [] as Array<{ placeholder: string; onInput: (v: string) => void }>,
}))

vi.mock('react-i18next', async () =>
  (await import('../../../__tests__/_render-mocks.js')).mockReactI18next(),
)

vi.mock('../data/songs-query.js', () => ({
  useSongsInfiniteQuery: songsHook,
  useFacetsInfiniteQuery: facetsHook,
  libraryQueryKeys: { songs: () => [], facets: () => [] },
}))

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigateSpy,
  useSearch: searchHook,
}))
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useInfiniteQuery: playlistsHook,
}))
vi.mock('../../playlist/api/index.js', () => ({
  getPlaylistApi: () => ({ addSongsToPlaylist: vi.fn(async () => {}) }),
}))
vi.mock('../../playlist/data/playlist-query.js', () => ({
  usePlaylistsInfiniteQuery: playlistsHook,
  playlistQueryKeys: { list: () => [] },
}))

vi.mock('../../playlist/data/playlist-mutations.js', () => ({
  useCreatePlaylistMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useReorderPlaylistsMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useDeletePlaylistMutation: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(async () => {}) }),
}))

vi.mock('../widgets/VirtualList.js', async () =>
  (await import('../../../__tests__/_render-mocks.js')).mockVirtualList(),
)

vi.mock('../widgets/FavoriteSongRow.js', async () => {
  const { SongRow } = await import('../widgets/SongRow.js')
  return { FavoriteSongRow: SongRow }
})

vi.mock('@lynx-js/lynx-ui-input', () => ({
  Input: (props: Record<string, unknown>) => {
    // Capture onInput callbacks so tests can simulate filter/search input.
    // The default mock from _render-mocks is a static placeholder — it never
    // calls onInput, which makes it impossible to test state changes triggered
    // by user typing. This wrapper pushes every onInput-bearing Input into
    // the hoisted array; tests find the one they need by placeholder text.
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

const { LibraryPage } = await import('../pages/LibraryPage.js')

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

function facetsResult(pages: { facets: SongFacet[]; total: number }[], over = {}) {
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

function playlistsResult(pages: { playlists: unknown[]; total: number }[], over = {}) {
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
  facetsHook.mockReturnValue(facetsResult([{ facets: [], total: 0 }]))
  playlistsHook.mockReturnValue(playlistsResult([{ playlists: [], total: 0 }]))
  searchHook.mockReturnValue({})
  filterInputs.length = 0
})

afterEach(() => {
  vi.clearAllMocks()
})

async function renderPage() {
  render(<LibraryPage />)
  await act(async () => {
    await Promise.resolve()
  })
  return getQueriesForElement(elementTree.root!)
}

test('songs view renders the switcher and a row per song (title, subtitle, duration)', async () => {
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

  expect(queryByText('Songs')).toBeInTheDocument()
  expect(queryByText('Categories')).toBeInTheDocument()
  expect(queryByText('Playlists')).toBeInTheDocument()

  expect(queryByText('Blue in Green')).toBeInTheDocument()
  expect(queryByText('So What')).toBeInTheDocument()
  expect(queryAllByText('Miles · KOB')).toHaveLength(2)
  expect(queryByText('05:27')).toBeInTheDocument()
  expect(queryByText('09:05')).toBeInTheDocument()
})

test('songs view shows the empty state when there are no songs', async () => {
  songsHook.mockReturnValue(songsResult([{ songs: [], total: 0 }]))
  const { queryByText } = await renderPage()
  expect(queryByText('No songs yet')).toBeInTheDocument()
})

test('songs view shows the loading state', async () => {
  songsHook.mockReturnValue(songsResult([], { isLoading: true, data: undefined }))
  const { queryByText } = await renderPage()
  expect(queryByText('Loading songs…')).toBeInTheDocument()
})

test('songs view renders search input and sort chips', async () => {
  songsHook.mockReturnValue(songsResult([{ songs: [], total: 0 }]))
  const { queryByText, queryAllByText } = await renderPage()

  expect(queryByText('Search songs...')).toBeInTheDocument()
  expect(queryByText('Recent')).toBeInTheDocument()
  expect(queryByText('Title')).toBeInTheDocument()
  expect(queryAllByText('Artist').length).toBeGreaterThanOrEqual(1)
})

test('songs view passes search keyword and sort to useSongsInfiniteQuery', async () => {
  songsHook.mockReturnValue(songsResult([{ songs: [], total: 0 }]))
  await renderPage()

  expect(songsHook).toHaveBeenCalledWith({
    sort: 'added_at',
    order: 'desc',
  })
})

test('categories view renders a facet grid when ?view=facets', async () => {
  searchHook.mockReturnValue({ view: 'facets' })
  facetsHook.mockReturnValue(
    facetsResult([
      {
        facets: [
          { value: 'Miles Davis', count: 12, coverUrl: '' },
          { value: 'John Coltrane', count: 8, coverUrl: '' },
        ],
        total: 2,
      },
    ]),
  )
  const { queryByText } = await renderPage()

  expect(queryByText('Artist')).toBeInTheDocument()
  expect(queryByText('Miles Davis')).toBeInTheDocument()
  expect(queryByText('12 songs')).toBeInTheDocument()
  expect(queryByText('John Coltrane')).toBeInTheDocument()
})

test('facet field is URL-driven (?field=album) and chip taps navigate with it', async () => {
  searchHook.mockReturnValue({ view: 'facets', field: 'album' })
  facetsHook.mockReturnValue(facetsResult([{ facets: [], total: 0 }]))
  const { getByText } = await renderPage()
  expect(facetsHook).toHaveBeenCalledWith('album')
  await act(async () => {
    fireEvent.tap(getByText('Genre'))
  })
  expect(navigateSpy).toHaveBeenCalledWith({
    to: '/library',
    search: { view: 'facets', field: 'genre' },
  })
})

test('playlists view renders the batch-6 PlaylistsView (empty state) when ?view=playlists', async () => {
  searchHook.mockReturnValue({ view: 'playlists' })
  const { queryByText } = await renderPage()
  expect(queryByText('No playlists yet')).toBeInTheDocument()
})

test('tapping a facet card navigates to the category drill-in with field/value/cover', async () => {
  searchHook.mockReturnValue({ view: 'facets' })
  facetsHook.mockReturnValue(
    facetsResult([
      {
        facets: [
          { value: 'Miles Davis', count: 12, coverUrl: 'covers/miles.jpg' },
        ],
        total: 1,
      },
    ]),
  )
  const { getByText } = await renderPage()
  await act(async () => {
    fireEvent.tap(getByText('Miles Davis'))
  })
  expect(navigateSpy).toHaveBeenCalledWith({
    to: '/library/category/$field',
    params: { field: 'artist' },
    search: { value: 'Miles Davis', cover: 'covers/miles.jpg' },
  })
})

test('tapping a tab navigates to /library with the view search param (URL-driven)', async () => {
  const { getByText } = await renderPage()
  await act(async () => {
    fireEvent.tap(getByText('Categories'))
  })
  expect(navigateSpy).toHaveBeenCalledWith({
    to: '/library',
    search: { view: 'facets' },
  })
})

// P1-12 regression: multi-select must clear when the visible song list changes
// (search or filter). Without the useEffect, selected IDs from the previous
// result set linger and get added to playlists even though they are no longer
// visible. To verify "remove fix → turns red": comment out the useEffect in
// LibraryPage.tsx and this test will fail — the toolbar still shows "1 selected"
// after the filter change.
test('multi-select is cleared when a filter changes', async () => {
  songsHook.mockReturnValue(
    songsResult([
      {
        songs: [makeSong(1, { title: 'Track A' }), makeSong(2, { title: 'Track B' })],
        total: 2,
      },
    ]),
  )
  const { getByText, queryByText } = await renderPage()

  // Enter select mode.
  await act(async () => {
    fireEvent.tap(getByText('Select'))
  })

  // Tap a song row to select it.
  await act(async () => {
    fireEvent.tap(getByText('Track A'))
  })

  // Toolbar shows the selected count.
  expect(queryByText('1 selected')).toBeInTheDocument()

  // Simulate typing in the Genre filter input.
  const genreInput = filterInputs.find(
    (i) => i.placeholder === 'Genre',
  )
  expect(genreInput).toBeDefined()
  await act(async () => {
    genreInput!.onInput('Rock')
  })

  // The useEffect should have cleared the selection — toolbar must be gone.
  expect(queryByText('1 selected')).not.toBeInTheDocument()
})
