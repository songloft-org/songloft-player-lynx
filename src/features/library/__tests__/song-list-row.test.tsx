import '../../../shims/router-env.js'

import '@testing-library/jest-dom'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { act, fireEvent, getQueriesForElement, render } from '@lynx-js/react/testing-library'

import type { Song } from '../../../models/song.js'

const { openInfoMock, favoriteToggleMock, playerStoreHook, openMenuMock, openAddToPlaylistMock, requestDeleteMock } = vi.hoisted(() => ({
  openInfoMock: vi.fn(),
  favoriteToggleMock: vi.fn(),
  playerStoreHook: vi.fn(),
  openMenuMock: vi.fn(),
  openAddToPlaylistMock: vi.fn(),
  requestDeleteMock: vi.fn(),
}))

vi.mock('react-i18next', async () =>
  (await import('../../../__tests__/_render-mocks.js')).mockReactI18next(),
)

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
    menuRow: { isWide: boolean } | null
    addToPlaylistSongIds: number[]
    deleteSong: Song | null
    openMenu: typeof openMenuMock
    closeMenu: () => void
    openInfo: typeof openInfoMock
    closeInfo: () => void
    openAddToPlaylist: typeof openAddToPlaylistMock
    closeAddToPlaylist: () => void
    requestDelete: typeof requestDeleteMock
    cancelDelete: () => void
  }) => unknown) =>
    selector({
      menuSong: null,
      menuRow: null,
      addToPlaylistSongIds: [],
      deleteSong: null,
      openMenu: openMenuMock,
      closeMenu: vi.fn(),
      openInfo: openInfoMock,
      closeInfo: vi.fn(),
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
  opts: { isWide?: boolean, isSongListWide?: boolean },
  props: { selectionMode?: boolean } = {},
) {
  render(
    <LibraryViewportProvider value={{ isWide: opts.isWide ?? false, isSongListWide: opts.isSongListWide ?? false }}>
      <SongListRow song={makeSong()} index={0} {...props} />
    </LibraryViewportProvider>,
  )
  await act(async () => {
    await Promise.resolve()
  })
  return getQueriesForElement(elementTree.root!)
}

test('narrow rows show a more button but no flat shortcuts', async () => {
  const { queryByTestId } = await renderRow({})
  expect(queryByTestId('song-row-more')).toBeInTheDocument()
  expect(queryByTestId('song-row-detail')).not.toBeInTheDocument()
  expect(queryByTestId('song-row-add')).not.toBeInTheDocument()
  expect(queryByTestId('song-row-delete')).not.toBeInTheDocument()
})

test('wide rows show only the add-to-playlist shortcut next to the more button', async () => {
  // Wide rows now show a single high-frequency shortcut (add-to-playlist).
  // Detail and delete stay in the ... menu.
  const { queryByTestId } = await renderRow({ isSongListWide: true })
  expect(queryByTestId('song-row-detail')).not.toBeInTheDocument()
  expect(queryByTestId('song-row-add')).toBeInTheDocument()
  expect(queryByTestId('song-row-delete')).not.toBeInTheDocument()
  expect(queryByTestId('song-row-more')).toBeInTheDocument()
})

test('selection mode strips the row tail and long-press', async () => {
  const { queryByTestId } = await renderRow({ isSongListWide: true }, { selectionMode: true })
  expect(queryByTestId('song-row-more')).not.toBeInTheDocument()
  expect(queryByTestId('song-row-add')).not.toBeInTheDocument()
})

test('the wide add shortcut opens the add-to-playlist sheet directly', async () => {
  const { getByTestId } = await renderRow({ isSongListWide: true })
  fireEvent.tap(getByTestId('song-row-add'), {})
  await act(async () => { await Promise.resolve() })
  expect(openAddToPlaylistMock).toHaveBeenCalledWith({ songIds: [1] })
  expect(openMenuMock).not.toHaveBeenCalled()
})

test('the favorite heart renders when the hook is wired (tap is catchtap: real-device)', async () => {
  favoriteToggleMock.mockReturnValue({ isFavorite: true, toggle: vi.fn(), isPending: false })
  const { queryByTestId } = await renderRow({})
  expect(queryByTestId('song-row-fav')).toBeInTheDocument()
})

test('selection mode hides the favorite heart too', async () => {
  const { queryByTestId } = await renderRow({}, { selectionMode: true })
  expect(queryByTestId('song-row-fav')).not.toBeInTheDocument()
})

/**
 * The `⋯` button is the song menu's anchor.
 */
test('the more button carries an anchor id for the menu to be measured against', async () => {
  const { getByTestId } = await renderRow({})
  expect(getByTestId('song-row-more').getAttribute('id')).toMatch(/^popover-anchor-\d+$/)
})

test('opening the menu anchors it to the measured button', async () => {
  const globals = globalThis as { lynx: { createSelectorQuery: unknown } }
  const saved = globals.lynx.createSelectorQuery
  globals.lynx.createSelectorQuery = () => {
    const pending: Array<() => void> = []
    let selector = ''
    const query = {
      select(sel: string) {
        selector = sel
        return query
      },
      invoke(
        { method, success, fail }: {
          method: string
          success: (res: unknown) => void
          fail: (res: unknown) => void
        },
      ) {
        const target = selector
        pending.push(() => {
          if (method !== 'boundingClientRect') return fail({})
          success(target === '.theme-root'
            ? { left: 0, top: 0, width: 420, height: 900 }
            : { left: 368, top: 120, width: 36, height: 36 })
        })
        return query
      },
      exec() {
        pending.splice(0).forEach((answer) => answer())
      },
    }
    return query
  }
  try {
    const { getByText } = await renderRow({})
    fireEvent.longpress(getByText('Blue in Green'), {})
    await act(async () => { await Promise.resolve() })
    expect(openMenuMock).toHaveBeenCalledWith({
      song: expect.objectContaining({ id: 1 }),
      anchor: {
        anchor: { left: 368, top: 120, width: 36, height: 36 },
        viewport: { width: 420, height: 900 },
      },
      row: { isWide: false },
    })
  } finally {
    globals.lynx.createSelectorQuery = saved
  }
})

test('the menu opens even when nothing can be measured', async () => {
  const { getByText } = await renderRow({})
  fireEvent.longpress(getByText('Blue in Green'), {})
  await act(async () => { await Promise.resolve() })
  expect(openMenuMock).toHaveBeenCalledWith({
    song: expect.objectContaining({ id: 1 }),
    anchor: null,
    row: { isWide: false },
  })
})

test('a wide row opens the menu with its viewport recorded as the row context', async () => {
  const { getByText } = await renderRow({ isWide: true })
  fireEvent.longpress(getByText('Blue in Green'), {})
  await act(async () => { await Promise.resolve() })
  expect(openMenuMock).toHaveBeenCalledWith({
    song: expect.objectContaining({ id: 1 }),
    anchor: null,
    row: { isWide: true },
  })
})