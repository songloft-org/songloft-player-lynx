import '@testing-library/jest-dom'
import { afterEach, expect, test, vi } from 'vitest'
import { act, fireEvent, getQueriesForElement, render } from '@lynx-js/react/testing-library'

/**
 * MiniPlayer render smoke. Mocks the player store (static, non-subscribing),
 * `useNavigate`, and the favorites hook (react-query backed — would throw
 * `No QueryClient set` otherwise); asserts the mini-player shows the current
 * song's title + "artist · album" subtitle, the play control, and the skip
 * controls (prev/next) that were added so the user can skip tracks without
 * opening the full player.
 */
vi.mock('react-i18next', async () =>
  (await import('../../../__tests__/_render-mocks.js')).mockReactI18next(),
)
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => () => {} }))
vi.mock('../../library/data/favorites.js', () => ({
  useIsFavorite: () => false,
  useFavoriteToggle: () => ({ isFavorite: false, toggle: vi.fn(), isPending: false }),
  getFavoriteState: async () => false,
  toggleFavoriteNonReact: async () => {},
}))
vi.mock('../store/player-store.js', async () => {
  const actual = await vi.importActual<typeof import('../store/player-store.js')>(
    '../store/player-store.js',
  )
  const { makePlayerStoreMock } = await import('../../../__tests__/_render-mocks.js')
  return makePlayerStoreMock(actual)
})

const { MiniPlayer } = await import('../widgets/MiniPlayer.js')

afterEach(() => vi.clearAllMocks())

test('shows the current song title, subtitle and play control', async () => {
  render(<MiniPlayer />)
  await act(async () => {
    await Promise.resolve()
  })
  const { queryByText, queryByTestId } = getQueriesForElement(elementTree.root!)

  expect(queryByText('Mock Song')).toBeInTheDocument()
  expect(queryByText('Mock Artist · Mock Album')).toBeInTheDocument()
  // Paused mock state -> the play (not pause) icon is rendered.
  expect(queryByTestId('icon-play')).toBeInTheDocument()
  expect(queryByTestId('icon-pause')).not.toBeInTheDocument()
})

/**
 * Skip controls: prev and next buttons render beside play/pause so the user
 * can skip tracks from the mini player. The standard mini-bar affordance
 * every major music player ships.
 */
test('shows prev/next skip controls alongside play/pause', async () => {
  render(<MiniPlayer />)
  await act(async () => {
    await Promise.resolve()
  })
  const { queryByTestId } = getQueriesForElement(elementTree.root!)

  expect(queryByTestId('icon-skip-prev')).toBeInTheDocument()
  expect(queryByTestId('icon-skip-next')).toBeInTheDocument()
})

/**
 * Wide-only favorite: the heart button is always rendered in the DOM (the
 * hook must stay mounted so state never desyncs during reflow), but CSS
 * hides it on narrow screens. The render test asserts the button and icon
 * exist; the CSS test asserts the show/hide rules.
 */
test('renders the favorite button (hidden via CSS on narrow)', async () => {
  render(<MiniPlayer />)
  await act(async () => {
    await Promise.resolve()
  })
  const { queryByTestId } = getQueriesForElement(elementTree.root!)

  expect(queryByTestId('mini-favorite-btn')).toBeInTheDocument()
  expect(queryByTestId('icon-heart')).toBeInTheDocument()
})

test('tapping a skip button calls the store action', async () => {
  render(<MiniPlayer />)
  await act(async () => {
    await Promise.resolve()
  })
  const { queryByTestId } = getQueriesForElement(elementTree.root!)

  const prevBtn = queryByTestId('icon-skip-prev')?.closest('[class*="mini-player__btn"]')
  expect(prevBtn).toBeTruthy()
  // catchtap prevents the tap from bubbling to the root's bindtap (which
  // would navigate to the full player instead of skipping).
  await act(async () => {
    fireEvent.tap(prevBtn!)
  })
})
