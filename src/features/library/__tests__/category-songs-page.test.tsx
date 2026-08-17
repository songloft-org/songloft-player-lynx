import '../../../shims/router-env.js'

import '@testing-library/jest-dom'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { act, getQueriesForElement, render } from '@lynx-js/react/testing-library'

import type { Song } from '../../../models/song.js'

/**
 * CategorySongsPage render smoke (Categories → facet drill-in).
 *
 * The songs `useInfiniteQuery` hook subscribes via `useSyncExternalStore`
 * (crashes the ReactLynx Vitest snapshot tree + needs a live QueryClient /
 * network), so it is a `vi.fn()` returning a static shape.
 * `useNavigate`/`useParams`/`useSearch` are stubbed, and the native `<list>`
 * wrapper is mocked to plain `<view>`s (children virtualize away in the env;
 * the real `<list>` ships on-device). Assertions check the real header (field
 * label + value) + the song rows produced from the injected data + the
 * empty/loading states.
 */
const { songsHook, paramsHook, searchHook } = vi.hoisted(() => ({
  songsHook: vi.fn(),
  paramsHook: vi.fn(),
  searchHook: vi.fn(),
}))

vi.mock('react-i18next', async () =>
  (await import('../../../__tests__/_render-mocks.js')).mockReactI18next(),
)

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => () => {},
  useParams: paramsHook,
  useSearch: searchHook,
}))

vi.mock('../data/songs-query.js', () => ({
  useSongsInfiniteQuery: songsHook,
  libraryQueryKeys: { songs: () => [] },
}))

vi.mock('../widgets/VirtualList.js', async () =>
  (await import('../../../__tests__/_render-mocks.js')).mockVirtualList(),
)

const { CategorySongsPage } = await import('../pages/CategorySongsPage.js')

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
  paramsHook.mockReturnValue({ field: 'artist' })
  searchHook.mockReturnValue({ value: 'Miles Davis' })
  songsHook.mockReturnValue(songsResult([{ songs: [], total: 0 }]))
})

afterEach(() => vi.clearAllMocks())

async function renderPage() {
  render(<CategorySongsPage />)
  await act(async () => {
    await Promise.resolve()
  })
  return getQueriesForElement(elementTree.root!)
}

test('renders the header (field label + value) and a row per song', async () => {
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

  // Header: field label + facet value as title.
  expect(queryByText('Artist')).toBeInTheDocument()
  expect(queryByText('Miles Davis')).toBeInTheDocument()

  // Song rows (title + "artist · album" subtitle + mm:ss).
  expect(queryByText('Blue in Green')).toBeInTheDocument()
  expect(queryByText('So What')).toBeInTheDocument()
  expect(queryAllByText('Miles · KOB')).toHaveLength(2)
  expect(queryByText('05:27')).toBeInTheDocument()
  expect(queryByText('09:05')).toBeInTheDocument()
})

test('passes the drilled field/value into the songs query filters', async () => {
  paramsHook.mockReturnValue({ field: 'genre' })
  searchHook.mockReturnValue({ value: 'Jazz' })
  await renderPage()

  expect(songsHook).toHaveBeenCalledWith(
    expect.objectContaining({ genre: 'Jazz', sort: 'added_at', order: 'desc' }),
  )
})

test('shows the empty state when the category has no songs', async () => {
  songsHook.mockReturnValue(songsResult([{ songs: [], total: 0 }]))
  const { queryByText } = await renderPage()
  expect(queryByText('No songs in this category')).toBeInTheDocument()
})

test('shows the loading state while songs load', async () => {
  songsHook.mockReturnValue(songsResult([], { isLoading: true, data: undefined }))
  const { queryByText } = await renderPage()
  expect(queryByText('Loading songs…')).toBeInTheDocument()
})

test('shows the play-history button for a facet dimension', async () => {
  paramsHook.mockReturnValue({ field: 'artist' })
  searchHook.mockReturnValue({ value: 'Miles Davis' })
  const { queryByTestId } = await renderPage()
  expect(queryByTestId('category-songs-history')).toBeInTheDocument()
})

test('hides it for source fields, which are not history contexts', async () => {
  paramsHook.mockReturnValue({ field: 'favorites' })
  searchHook.mockReturnValue({ value: 'whatever' })
  const { queryByTestId } = await renderPage()
  expect(queryByTestId('category-songs-history')).not.toBeInTheDocument()
})

test('hides it for the empty "unknown" bucket, which the backend would reject', async () => {
  paramsHook.mockReturnValue({ field: 'artist' })
  searchHook.mockReturnValue({ value: '' })
  const { queryByTestId } = await renderPage()
  expect(queryByTestId('category-songs-history')).not.toBeInTheDocument()
})
