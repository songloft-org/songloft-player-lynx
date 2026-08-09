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

/**
 * LibraryPage render smoke.
 *
 * Like the login-page test, the two runtime facilities that crash the ReactLynx
 * Vitest snapshot tree are mocked to plain, non-subscribing stand-ins so the
 * page's real structure is still exercised (the real hooks/components ship in
 * build/dev/on-device):
 *
 *  - the TanStack Query **infinite-query hooks** (`useSongsInfiniteQuery` /
 *    `useFacetsInfiniteQuery`) subscribe via `useSyncExternalStore`; left real
 *    they trip the env's `isListHolder`/`parentNode` second-commit crash (same
 *    class as the zustand subscription in batch 3) and also require a live
 *    `QueryClientProvider` + network. Here they are `vi.fn()` returning static
 *    infinite-query shapes, so `flattenSongs`/`flattenFacets` + the view logic
 *    run against real data.
 *
 * The assertions check the real rendered structure: song rows (title + subtitle
 * + formatted duration), the empty state, and the facet grid — not injected
 * fixtures echoed back.
 */
const { songsHook, facetsHook } = vi.hoisted(() => ({
  songsHook: vi.fn(),
  facetsHook: vi.fn(),
}))

vi.mock('../data/songs-query.js', () => ({
  useSongsInfiniteQuery: songsHook,
  useFacetsInfiniteQuery: facetsHook,
  libraryQueryKeys: { songs: () => [], facets: () => [] },
}))

// `<list>`/`<list-item>` virtualize their children (not mounted into the env's
// queryable tree), so the native-list wrapper is stubbed to plain `<view>`s.
// The real `<list>` ships in build/dev/on-device. See `_render-mocks.tsx`.
vi.mock('../widgets/VirtualList.js', async () =>
  (await import('../../../__tests__/_render-mocks.js')).mockVirtualList(),
)

// Import AFTER the mock is registered.
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

/** Minimal infinite-query result shape the page consumes. */
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

beforeEach(() => {
  // Sensible defaults; individual tests override as needed.
  songsHook.mockReturnValue(songsResult([{ songs: [], total: 0 }]))
  facetsHook.mockReturnValue(facetsResult([{ facets: [], total: 0 }]))
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

  // View switcher tabs.
  expect(queryByText('Songs')).toBeInTheDocument()
  expect(queryByText('Categories')).toBeInTheDocument()
  expect(queryByText('Playlists')).toBeInTheDocument()

  // A row per song with title + "artist · album" subtitle + mm:ss duration.
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

test('categories view renders a facet grid after switching tabs', async () => {
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
  const { queryByText, getByText } = await renderPage()

  await act(async () => {
    fireEvent.tap(getByText('Categories'))
  })

  // Facet field chips + facet cards (value + "<n> songs").
  expect(queryByText('Artist')).toBeInTheDocument()
  expect(queryByText('Miles Davis')).toBeInTheDocument()
  expect(queryByText('12 songs')).toBeInTheDocument()
  expect(queryByText('John Coltrane')).toBeInTheDocument()
})

test('playlists view shows the placeholder', async () => {
  const { queryByText, getByText } = await renderPage()
  await act(async () => {
    fireEvent.tap(getByText('Playlists'))
  })
  expect(queryByText('Playlists coming soon')).toBeInTheDocument()
})
