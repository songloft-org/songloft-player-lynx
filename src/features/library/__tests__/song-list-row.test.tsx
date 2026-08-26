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
    menuRow: { isWide: boolean; deleteShortcut: boolean } | null
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
  expect(openAddToPlaylistMock).toHaveBeenCalledWith({ songIds: [1] })
  expect(openMenuMock).not.toHaveBeenCalled()
})

test('the wide delete shortcut dispatches to the global delete confirm', async () => {
  const { getByTestId } = await renderRow(true)
  fireEvent.tap(getByTestId('song-row-delete'), {})
  await act(async () => { await Promise.resolve() })
  expect(requestDeleteMock).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }))
})

test('the wide detail shortcut opens the global info dialog for the song', async () => {
  const { getByTestId } = await renderRow(true)
  fireEvent.tap(getByTestId('song-row-detail'), {})
  await act(async () => { await Promise.resolve() })
  expect(openInfoMock).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }))
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

/**
 * The `⋯` button is the song menu's anchor.
 *
 * The menu itself renders at the app root — it cannot live in the row, whose
 * virtualized `<list-item>` clips overlays — so the *row* has to measure the button
 * and send the rect along with the song. Two halves, and the second one is the
 * regression that matters: an anchor that fails to measure must still open the menu.
 *
 * Driven through **long-press** rather than the `⋯` button: that button is `catchtap`,
 * and this env dispatches `bindtap` only (measured — same limitation the favorite
 * heart's test notes). Both entry points call the same opener with the same anchor, so
 * what is under test is unaffected; only the trigger differs.
 */
test('the more button carries an anchor id for the menu to be measured against', async () => {
  const { getByTestId } = await renderRow(false)
  // Without the id the selector resolves to nothing on device and the menu silently
  // falls back to the docked sheet on every row.
  expect(getByTestId('song-row-more').getAttribute('id')).toMatch(/^popover-anchor-\d+$/)
})

test('opening the menu anchors it to the measured button', async () => {
  const globals = globalThis as { lynx: { createSelectorQuery: unknown } }
  const saved = globals.lynx.createSelectorQuery
  // Stands in for the host's invoke bridge: both rects answer, on `exec`, from one
  // query — the shape `measureAnchor` builds (see its doc). Mutating the method rather
  // than replacing `lynx`: it is a bare host global that this env injects as a
  // module-scope binding, so assigning `globalThis.lynx` is invisible to the code under
  // test (measured), while this is not.
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
    const { getByText } = await renderRow(false)
    fireEvent.longpress(getByText('Blue in Green'), {})
    await act(async () => { await Promise.resolve() })
    // The row context rides along (here: a narrow row whose tail renders no
    // shortcuts) so the global menu — outside LibraryViewportProvider — can
    // prune items the row's own buttons already expose.
    expect(openMenuMock).toHaveBeenCalledWith({
      song: expect.objectContaining({ id: 1 }),
      anchor: {
        anchor: { left: 368, top: 120, width: 36, height: 36 },
        viewport: { width: 420, height: 900 },
      },
      row: { isWide: false, deleteShortcut: true },
    })
  } finally {
    globals.lynx.createSelectorQuery = saved
  }
})

test('the menu opens even when nothing can be measured', async () => {
  // This env's `SelectorQuery.select` throws when nothing matches, which stands in for
  // every host that cannot answer `boundingClientRect`. The menu then docks to the
  // bottom (`GlobalMenu`), but it *opens* — a menu that waits for a measurement that
  // never comes is a dead button.
  const { getByText } = await renderRow(false)
  fireEvent.longpress(getByText('Blue in Green'), {})
  await act(async () => { await Promise.resolve() })
  expect(openMenuMock).toHaveBeenCalledWith({
    song: expect.objectContaining({ id: 1 }),
    anchor: null,
    row: { isWide: false, deleteShortcut: true },
  })
})

test('a wide row opens the menu with its shortcut set as the row context', async () => {
  // Driven through long-press: the `⋯` button is `catchtap` and this env
  // dispatches `bindtap` only (see the anchor test above) — both entry points
  // call the same opener, so what is under test is unaffected.
  const { getByText } = await renderRow(true)
  fireEvent.longpress(getByText('Blue in Green'), {})
  await act(async () => { await Promise.resolve() })
  // deleteShortcut mirrors showDeleteAction, which defaults to true. Anchor is
  // null because this env cannot measure (see the dead-anchor test below).
  expect(openMenuMock).toHaveBeenCalledWith({
    song: expect.objectContaining({ id: 1 }),
    anchor: null,
    row: { isWide: true, deleteShortcut: true },
  })
})

test("a row with showDeleteAction=false reports no delete shortcut to the menu", async () => {
  const { getByText } = await renderRow(true, { showDeleteAction: false })
  fireEvent.longpress(getByText('Blue in Green'), {})
  await act(async () => { await Promise.resolve() })
  // The playlist detail rows: the menu keeps its library-delete item because
  // the row tail's × is the "remove from playlist" action, not this one.
  expect(openMenuMock).toHaveBeenCalledWith({
    song: expect.objectContaining({ id: 1 }),
    anchor: null,
    row: { isWide: true, deleteShortcut: false },
  })
})
