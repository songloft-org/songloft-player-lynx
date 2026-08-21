import '../../../shims/router-env.js'

import '@testing-library/jest-dom'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { act, fireEvent, getQueriesForElement, render } from '@lynx-js/react/testing-library'

import type { Song } from '../../../models/song.js'

const { navigateToSongDetailMock, favoriteToggleMock, playerStoreHook, openMenuMock, openAddToPlaylistMock, requestDeleteMock } = vi.hoisted(() => ({
  navigateToSongDetailMock: vi.fn(),
  favoriteToggleMock: vi.fn(),
  playerStoreHook: vi.fn(),
  openMenuMock: vi.fn(),
  openAddToPlaylistMock: vi.fn(),
  requestDeleteMock: vi.fn(),
}))

vi.mock('react-i18next', async () =>
  (await import('../../../__tests__/_render-mocks.js')).mockReactI18next(),
)

vi.mock('../../../shared/nav/navigate-to-song-detail.js', () => ({
  useNavigateToSongDetail: () => navigateToSongDetailMock,
}))

/*
 * The row dispatches its overlay intents to the global store (the overlays
 * mount in the root route, outside every virtualized list — see
 * `song-row-overlays.ts`). The zustand hook cannot run in this env (ReactLynx
 * vs the stock React zustand resolves to), so the module is mocked to a
 * selector over a static state; the store's own semantics live in
 * `song-row-overlays.test.ts`.
 */
vi.mock('../../../shared/ui/song-row-overlays.js', () => ({
  useSongRowOverlays: (selector: (s: {
    menuSong: Song | null
    addToPlaylistSong: Song | null
    deleteSong: Song | null
    openMenu: typeof openMenuMock
    closeMenu: () => void
    openAddToPlaylist: typeof openAddToPlaylistMock
    closeAddToPlaylist: () => void
    requestDelete: typeof requestDeleteMock
    cancelDelete: () => void
  }) => unknown) =>
    selector({
      menuSong: null,
      addToPlaylistSong: null,
      deleteSong: null,
      openMenu: openMenuMock,
      closeMenu: vi.fn(),
      openAddToPlaylist: openAddToPlaylistMock,
      closeAddToPlaylist: vi.fn(),
      requestDelete: requestDeleteMock,
      cancelDelete: vi.fn(),
    }),
}))

vi.mock('../data/favorites.js', () => ({
  useFavoriteToggle: favoriteToggleMock,
}))

vi.mock('../../player/store/index.js', () => ({
  usePlayerStore: playerStoreHook,
}))

const { SongListRow } = await import('../widgets/SongListRow.js')
const { LibraryViewportProvider } = await import('../pages/library-viewport.js')

function makeSong(over: Partial<Song> = {}): Song {
  return {
    id: 1,
    type: 'local',
    title: 'Blue in Green',
    artist: 'Miles Davis',
    album: 'Kind of Blue',
    year: 0,
    genre: undefined,
    language: undefined,
    style: undefined,
    duration: 327,
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

beforeEach(() => {
  favoriteToggleMock.mockReturnValue({ isFavorite: false, toggle: vi.fn(), isPending: false })
  playerStoreHook.mockImplementation((selector: (s: { currentSong: null }) => unknown) =>
    selector({ currentSong: null }))
})

afterEach(() => vi.clearAllMocks())

async function renderRow(
  isWide: boolean,
  props: { selectionMode?: boolean; showDeleteAction?: boolean } = {},
) {
  render(
    <LibraryViewportProvider value={{ isWide }}>
      <SongListRow song={makeSong()} index={0} {...props} />
    </LibraryViewportProvider>,
  )
  await act(async () => {
    await Promise.resolve()
  })
  return getQueriesForElement(elementTree.root!)
}

test('narrow rows show a more button but no flat shortcuts', async () => {
  const { queryByTestId } = await renderRow(false)
  expect(queryByTestId('song-row-more')).toBeInTheDocument()
  expect(queryByTestId('song-row-detail')).not.toBeInTheDocument()
  expect(queryByTestId('song-row-add')).not.toBeInTheDocument()
  expect(queryByTestId('song-row-delete')).not.toBeInTheDocument()
})

test('wide rows flatten detail / add / delete shortcuts next to the more button', async () => {
  const { queryByTestId } = await renderRow(true)
  expect(queryByTestId('song-row-detail')).toBeInTheDocument()
  expect(queryByTestId('song-row-add')).toBeInTheDocument()
  expect(queryByTestId('song-row-delete')).toBeInTheDocument()
  expect(queryByTestId('song-row-more')).toBeInTheDocument()
})

test('showDeleteAction=false hides the destructive shortcut (playlist detail rows)', async () => {
  const { queryByTestId } = await renderRow(true, { showDeleteAction: false })
  expect(queryByTestId('song-row-delete')).not.toBeInTheDocument()
  expect(queryByTestId('song-row-add')).toBeInTheDocument()
})

test('selection mode strips the row tail and long-press', async () => {
  const { queryByTestId } = await renderRow(true, { selectionMode: true })
  expect(queryByTestId('song-row-more')).not.toBeInTheDocument()
  expect(queryByTestId('song-row-detail')).not.toBeInTheDocument()
  expect(queryByTestId('song-row-delete')).not.toBeInTheDocument()
})

test('the wide add shortcut opens the add-to-playlist sheet directly', async () => {
  const { getByTestId } = await renderRow(true)
  fireEvent.tap(getByTestId('song-row-add'), {})
  await act(async () => { await Promise.resolve() })
  // Straight to the sheet rather than through the menu: the shortcut has
  // already decided what the user wants.
  expect(openAddToPlaylistMock).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }))
  expect(openMenuMock).not.toHaveBeenCalled()
})

test('the wide delete shortcut dispatches to the global delete confirm', async () => {
  const { getByTestId } = await renderRow(true)
  fireEvent.tap(getByTestId('song-row-delete'), {})
  await act(async () => { await Promise.resolve() })
  expect(requestDeleteMock).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }))
})

test('the wide detail shortcut navigates to the song page through the origin-recording helper', async () => {
  const { getByTestId } = await renderRow(true)
  fireEvent.tap(getByTestId('song-row-detail'), {})
  await act(async () => { await Promise.resolve() })
  expect(navigateToSongDetailMock).toHaveBeenCalledWith(1)
})

test('the favorite heart renders when the hook is wired (tap is catchtap: real-device)', async () => {
  favoriteToggleMock.mockReturnValue({ isFavorite: true, toggle: vi.fn(), isPending: false })
  const { queryByTestId } = await renderRow(false)
  // SongRow renders the heart only when onToggleFavorite is provided, which
  // SongListRow always does outside selection mode.
  expect(queryByTestId('song-row-fav')).toBeInTheDocument()
})

test('selection mode hides the favorite heart too', async () => {
  const { queryByTestId } = await renderRow(false, { selectionMode: true })
  expect(queryByTestId('song-row-fav')).not.toBeInTheDocument()
})
