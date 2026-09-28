import '@testing-library/jest-dom'
import { afterEach, expect, test, vi } from 'vitest'
import { act, fireEvent, getQueriesForElement, render } from '@lynx-js/react/testing-library'

import type { Song } from '../../../models/song.js'

/**
 * PlaylistDrawer render — the play-queue rows.
 *
 * The queue renders through `VirtualList` (the native `<list>`, virtualized).
 * The previous implementation mounted every row eagerly through
 * `SortableRoot`/`ScrollView` — each row a main-thread `DraggableRoot` with a
 * layoutchange listener and a drag overlay — which froze the app on 500+ song
 * queues (songloft-org/songloft-player-lynx#4). Drag-to-reorder left with it;
 * rows still tap-to-play (`bindtap`) and ✕-remove (`catchtap`).
 *
 * The mock below wraps the shared `mockVirtualList` stand-in (rows really
 * render and are queryable, like every other VirtualList consumer's tests)
 * and additionally records the props, so the regression tests can assert the
 * WHOLE queue is delegated to the virtualized list in one call — an assertion
 * that fails against the old eager-mount drawer and fails again if a
 * non-virtualized full render is ever reintroduced here.
 *
 * `fireEvent.tap()` invokes `bindtap` but not `catchtap` (confirmed
 * empirically — same class of gap as `MiniPlayer`'s play control and
 * `SongRow`'s favorite toggle), so tap-to-play gets behavior coverage while
 * the ✕ remove stays structural and is real-device-only verified.
 */
vi.mock('react-i18next', async () =>
  (await import('../../../__tests__/_render-mocks.js')).mockReactI18next(),
)

const virtualListCalls: { items: readonly unknown[], className?: string }[] = []
vi.mock('../../library/widgets/VirtualList.js', async () => {
  const { mockVirtualList } = await import('../../../__tests__/_render-mocks.js')
  const { VirtualList: Stub } = mockVirtualList()
  function VirtualList(props: Parameters<typeof Stub>[0]) {
    virtualListCalls.push({ items: props.items ?? [], className: props.className })
    return Stub(props)
  }
  return { VirtualList }
})

function song(id: number): Song {
  return { id, type: 'local', title: `Song ${id}`, artist: `Artist ${id}` } as Song
}

function defaultState() {
  return {
    showPlaylistDrawer: true,
    playlist: [song(1), song(2), song(3)],
    currentIndex: 0,
  }
}

let state = defaultState()

const playPlaylist = vi.fn()
const removeFromPlaylist = vi.fn()
const closePlaylistDrawer = vi.fn()

vi.mock('../store/index.js', () => {
  function usePlayerStore<T>(selector?: (s: typeof state) => T) {
    return selector ? selector(state) : state
  }
  usePlayerStore.getState = () => ({
    ...state,
    playPlaylist,
    removeFromPlaylist,
    closePlaylistDrawer,
  })
  return { usePlayerStore }
})

const { PlaylistDrawer } = await import('../widgets/PlaylistDrawer.js')

afterEach(() => {
  vi.clearAllMocks()
  virtualListCalls.length = 0
  state = defaultState()
})

async function renderDrawer() {
  render(<PlaylistDrawer />)
  await act(async () => {
    await Promise.resolve()
  })
  return getQueriesForElement(elementTree.root!)
}

test('delegates the whole queue to the virtualized list', async () => {
  const { getByText, queryByTestId } = await renderDrawer()
  expect(queryByTestId('playlist-drawer')).toBeInTheDocument()
  expect(virtualListCalls).toHaveLength(1)
  expect(virtualListCalls[0]!.items).toHaveLength(3)
  expect(virtualListCalls[0]!.className).toBe('drawer__list drawer__list--queue')
  expect(getByText('Song 1')).toBeInTheDocument()
  expect(getByText('Song 3')).toBeInTheDocument()
})

test('a 500-song queue is one virtualized list, not 500 eager rows (songloft-org/songloft-player-lynx#4)', async () => {
  state = {
    showPlaylistDrawer: true,
    playlist: Array.from({ length: 500 }, (_, i) => song(i + 1)),
    currentIndex: 42,
  }
  const { getByText } = await renderDrawer()
  expect(virtualListCalls).toHaveLength(1)
  expect(virtualListCalls[0]!.items).toHaveLength(500)
  expect(getByText('Song 43')).toBeInTheDocument()
  expect(getByText('Song 500')).toBeInTheDocument()
})

test('the current song row wears the active wash, siblings do not', async () => {
  state = { showPlaylistDrawer: true, playlist: [song(1), song(2), song(3)], currentIndex: 1 }
  const { getByText } = await renderDrawer()
  // text → ScrollingText clip box → row-meta → row (the stub's key wrapper sits
  // above the row); the extra hop is the marquee wrapper from #46.
  const active = getByText('Song 2').parentElement!.parentElement!.parentElement!
  expect(active.className).toContain('drawer__row--active')
  const sibling = getByText('Song 1').parentElement!.parentElement!.parentElement!
  expect(sibling.className).not.toContain('drawer__row--active')
})

test('drag handles are gone — the queue is no longer sortable in-drawer', async () => {
  const { queryByTestId } = await renderDrawer()
  expect(queryByTestId('drawer-drag-1')).not.toBeInTheDocument()
  expect(queryByTestId('drawer-drag-2')).not.toBeInTheDocument()
})

test('tapping a row plays that song and closes the drawer', async () => {
  const { getByText } = await renderDrawer()
  // The meta column carries the row's `bindtap`; the title text sits inside it.
  fireEvent.tap(getByText('Song 3').parentElement!, {})
  await act(async () => {
    await Promise.resolve()
  })
  expect(playPlaylist).toHaveBeenCalledWith(state.playlist, 2)
  expect(closePlaylistDrawer).toHaveBeenCalledTimes(1)
})

test('every row keeps its ✕ remove affordance', async () => {
  const { getAllByText } = await renderDrawer()
  expect(getAllByText('✕')).toHaveLength(3)
  // The remove button is `catchtap`, which fireEvent.tap does not invoke —
  // the behavior itself is real-device-only verified (see file header).
  expect(removeFromPlaylist).not.toHaveBeenCalled()
})
