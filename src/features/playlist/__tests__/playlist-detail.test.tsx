import '../../../shims/router-env.js'

import '@testing-library/jest-dom'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { act, fireEvent, getQueriesForElement, render } from '@lynx-js/react/testing-library'

import type { Playlist } from '../../../models/playlist.js'
import type { Song } from '../../../models/song.js'

const { detailHook, songsHook, deleteMutationHook, updateMutationHook, removeSongMutationHook, reorderSongsMutationHook, visibilityMutationHook, sortMutationHook } = vi.hoisted(() => ({
  detailHook: vi.fn(),
  songsHook: vi.fn(),
  deleteMutationHook: vi.fn(),
  updateMutationHook: vi.fn(),
  removeSongMutationHook: vi.fn(),
  reorderSongsMutationHook: vi.fn(),
  visibilityMutationHook: vi.fn(),
  sortMutationHook: vi.fn(),
}))

vi.mock('react-i18next', async () =>
  (await import('../../../__tests__/_render-mocks.js')).mockReactI18next(),
)

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => () => {},
  useParams: () => ({ id: '7' }),
}))

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useInfiniteQuery: () => ({ data: undefined, isLoading: false }),
}))

vi.mock('../../../shared/ui/SongContextMenu.js', () => ({
  SongContextMenu: () => null,
}))

vi.mock('@lynx-js/lynx-ui-input', async () =>
  (await import('../../../__tests__/_render-mocks.js')).mockLynxUiInput(),
)

vi.mock('@lynx-js/lynx-ui-sortable', async () =>
  (await import('../../../__tests__/_render-mocks.js')).mockLynxUiSortable(),
)

vi.mock('../data/playlist-query.js', () => ({
  usePlaylistQuery: detailHook,
  usePlaylistSongsInfiniteQuery: songsHook,
  playlistQueryKeys: { detail: () => [], songs: () => [] },
}))

vi.mock('../data/playlist-mutations.js', () => ({
  useDeletePlaylistMutation: deleteMutationHook,
  useUpdatePlaylistMutation: updateMutationHook,
  useRemoveSongMutation: removeSongMutationHook,
  useReorderSongsMutation: reorderSongsMutationHook,
  useSetVisibilityMutation: visibilityMutationHook,
  useUpdateSortMutation: sortMutationHook,
}))

vi.mock('../../library/widgets/VirtualList.js', async () =>
  (await import('../../../__tests__/_render-mocks.js')).mockVirtualList(),
)

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
  reorderSongsMutationHook.mockReturnValue(mutationResult())
  visibilityMutationHook.mockReturnValue(mutationResult())
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

test('shows delete and edit buttons for non-built-in playlists', async () => {
  detailHook.mockReturnValue(detailResult(makePlaylist({ isBuiltIn: false })))
  const { queryByText } = await renderPage()
  expect(queryByText('Delete')).toBeInTheDocument()
  expect(queryByText('Edit')).toBeInTheDocument()
})

test('hides delete and edit buttons for built-in playlists', async () => {
  detailHook.mockReturnValue(detailResult(makePlaylist({ isBuiltIn: true })))
  const { queryByText } = await renderPage()
  expect(queryByText('Delete')).not.toBeInTheDocument()
  expect(queryByText('Edit')).not.toBeInTheDocument()
})

test('shows the reorder button once all songs are loaded', async () => {
  songsHook.mockReturnValue(
    songsResult([{ songs: [makeSong(1), makeSong(2)], total: 2 }], { hasNextPage: false }),
  )
  const { queryByText } = await renderPage()
  expect(queryByText('Reorder')).toBeInTheDocument()
})

test('hides the reorder button while more pages remain unloaded', async () => {
  songsHook.mockReturnValue(
    songsResult([{ songs: [makeSong(1), makeSong(2)], total: 5 }], { hasNextPage: true }),
  )
  const { queryByText } = await renderPage()
  expect(queryByText('Reorder')).not.toBeInTheDocument()
})

test('sort mode renders drag handles for each song', async () => {
  songsHook.mockReturnValue(
    songsResult([{ songs: [makeSong(1), makeSong(2)], total: 2 }], { hasNextPage: false }),
  )
  const { queryByText, queryByTestId } = await renderPage()
  await act(async () => {
    fireEvent.tap(queryByText('Reorder')!)
    await Promise.resolve()
  })
  expect(queryByTestId('playlist-detail-drag-1')).toBeInTheDocument()
  expect(queryByTestId('playlist-detail-drag-2')).toBeInTheDocument()
})
