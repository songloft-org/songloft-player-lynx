import '@testing-library/jest-dom'
import { afterEach, expect, test, vi } from 'vitest'
import { act, fireEvent, getQueriesForElement, render } from '@lynx-js/react/testing-library'

/**
 * An unavailable transport control must not fire.
 *
 * `<PlayControls>` marks an unavailable prev/next with `--disabled`, and that
 * class only dims it: Lynx parses `:disabled` but never matches it
 * (lynx-api-docs/css/pseudo-classes.md), so the dim WAS the entire
 * implementation. On a one-song queue, tapping "previous" therefore still called
 * `playPrev()` — the control looked unavailable and quietly did something
 * anyway. `FavoriteButton` in the same file already dropped its handler while
 * pending; the transport row now matches it.
 *
 * The mock store is static and non-subscribing, so each test writes the queue and
 * its spies into the live state object *before* rendering — after `render()` the
 * component will not re-read it.
 */

vi.mock('react-i18next', async () =>
  (await import('../../../__tests__/_render-mocks.js')).mockReactI18next(),
)
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => () => {} }))
vi.mock('../../settings/data/settings-prefs.js', () => ({
  writeDefaultPlayMode: vi.fn(),
  readAudioQuality: vi.fn(async () => 'original'),
  readNormalize: vi.fn(async () => false),
  readPlaybackSpeed: vi.fn(async () => 1),
  writePlaybackSpeed: vi.fn(async () => {}),
  readAutoEnterLyrics: vi.fn(async () => false),
}))
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

const { PlayControls } = await import('../widgets/PlayControls.js')
const { usePlayerStore } = await import('../store/player-store.js')
const { mockSong } = await import('../../../__tests__/_render-mocks.js')

const PROPS = { playBtn: 52, playRadius: 26, slot: 36, songId: 1 }

interface Spies {
  playPrev: () => void
  playNext: () => void
}

/** Order mode: index 0 of a 1-song queue has neither prev nor next. */
function setQueue(currentIndex: number, length: number, spies: Spies): void {
  const state = usePlayerStore.getState() as unknown as Record<string, unknown>
  state.playMode = 'order'
  state.currentIndex = currentIndex
  state.playlist = Array.from({ length }, () => mockSong())
  state.playPrev = spies.playPrev
  state.playNext = spies.playNext
}

async function renderControls() {
  render(<PlayControls {...PROPS} />)
  await act(async () => {
    await Promise.resolve()
  })
  return getQueriesForElement(elementTree.root!)
}

afterEach(() => vi.clearAllMocks())

test('a one-song queue marks both skip controls disabled', async () => {
  setQueue(0, 1, { playPrev: vi.fn(), playNext: vi.fn() })
  const { getByTestId } = await renderControls()

  expect(getByTestId('prev-btn').className).toContain('player-controls__btn--disabled')
  expect(getByTestId('next-btn').className).toContain('player-controls__btn--disabled')
})

test('tapping a disabled skip control does nothing', async () => {
  const playPrev = vi.fn()
  const playNext = vi.fn()
  setQueue(0, 1, { playPrev, playNext })
  const { getByTestId } = await renderControls()

  fireEvent.tap(getByTestId('prev-btn'))
  fireEvent.tap(getByTestId('next-btn'))

  expect(playPrev).not.toHaveBeenCalled()
  expect(playNext).not.toHaveBeenCalled()
})

test('an enabled skip control still fires', async () => {
  /*
   * Reverse verification for the case above: a guard that dropped the handler
   * unconditionally would make that test pass for entirely the wrong reason.
   * This pins that the handler survives when the control IS available — index 1
   * of 3 in order mode has both.
   */
  const playPrev = vi.fn()
  const playNext = vi.fn()
  setQueue(1, 3, { playPrev, playNext })
  const { getByTestId } = await renderControls()

  expect(getByTestId('prev-btn').className).not.toContain('player-controls__btn--disabled')
  expect(getByTestId('next-btn').className).not.toContain('player-controls__btn--disabled')

  fireEvent.tap(getByTestId('prev-btn'))
  fireEvent.tap(getByTestId('next-btn'))

  expect(playPrev).toHaveBeenCalledTimes(1)
  expect(playNext).toHaveBeenCalledTimes(1)
})
