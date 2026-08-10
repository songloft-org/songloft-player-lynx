import '@testing-library/jest-dom'
import { afterEach, expect, test, vi } from 'vitest'
import { act, getQueriesForElement, render } from '@lynx-js/react/testing-library'

import type { Song } from '../../../models/song.js'

/**
 * PlaylistDrawer render smoke — the queue reorder chevrons. `Sheet` is mocked
 * to a plain view (per the shared `_render-mocks` factory) so the sheet's
 * content renders unconditionally, regardless of the store's `show` flag.
 *
 * The move buttons use `catchtap` (so tapping them doesn't also trigger the
 * row's own "play this song" `bindtap`) — same pattern as `MiniPlayer`'s play
 * control and `SongRow`'s favorite toggle. `fireEvent.tap()` from
 * `@lynx-js/react/testing-library` does not invoke `catchtap` handlers (only
 * `bindtap`, confirmed empirically — same class of gap as the `<refresh>`
 * `bindstartrefresh` gesture, see PROGRESS), so the actual reorder-on-tap
 * behavior is real-device-only verified; this file covers the renderable
 * structure (which rows get move affordances, boundary rows don't).
 */
vi.mock('react-i18next', async () =>
  (await import('../../../__tests__/_render-mocks.js')).mockReactI18next(),
)
vi.mock('@lynx-js/lynx-ui-sheet', async () =>
  (await import('../../../__tests__/_render-mocks.js')).mockLynxUiSheet(),
)

function song(id: number): Song {
  return { id, type: 'local', title: `Song ${id}`, artist: `Artist ${id}` } as Song
}

let state = {
  showPlaylistDrawer: true,
  playlist: [song(1), song(2), song(3)],
  currentIndex: 0,
}

vi.mock('../store/index.js', () => {
  function usePlayerStore<T>(selector?: (s: typeof state) => T) {
    return selector ? selector(state) : state
  }
  usePlayerStore.getState = () => ({
    ...state,
    reorderPlaylist: vi.fn(),
    removeFromPlaylist: vi.fn(),
    closePlaylistDrawer: vi.fn(),
    playPlaylist: vi.fn(),
  })
  return { usePlayerStore }
})

const { PlaylistDrawer } = await import('../widgets/PlaylistDrawer.js')

afterEach(() => vi.clearAllMocks())

async function renderDrawer() {
  render(<PlaylistDrawer />)
  await act(async () => {
    await Promise.resolve()
  })
  return getQueriesForElement(elementTree.root!)
}

test('renders move up/down affordances for every row when the queue has more than one song', async () => {
  const { queryByTestId } = await renderDrawer()
  expect(queryByTestId('drawer-move-up-2')).toBeInTheDocument()
  expect(queryByTestId('drawer-move-down-2')).toBeInTheDocument()
})

test('hides move affordances entirely for a single-song queue', async () => {
  state = { showPlaylistDrawer: true, playlist: [song(1)], currentIndex: 0 }
  const { queryByTestId } = await renderDrawer()
  expect(queryByTestId('drawer-move-up-1')).not.toBeInTheDocument()
  expect(queryByTestId('drawer-move-down-1')).not.toBeInTheDocument()
})
