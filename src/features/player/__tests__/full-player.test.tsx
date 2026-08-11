import '@testing-library/jest-dom'
import { afterEach, expect, test, vi } from 'vitest'
import { act, fireEvent, getQueriesForElement, render } from '@lynx-js/react/testing-library'

/**
 * FullPlayerPage render smoke. Same pattern as the library/login tests: the
 * lynx-ui native leaves (Slider/Sheet/Swiper) and the zustand player/lyric
 * subscriptions crash the ReactLynx Vitest tree, so they are mocked to static
 * stand-ins (real ones ship on-device). `useNavigate` is stubbed so the page can
 * render without a RouterProvider. Assertions check the real rendered structure
 * (title, artist, "Now Playing", play glyph, formatted times), not fixtures.
 */
const { navigateSpy, writePrefSpy } = vi.hoisted(() => ({
  navigateSpy: vi.fn(),
  writePrefSpy: vi.fn(),
}))

vi.mock('react-i18next', async () =>
  (await import('../../../__tests__/_render-mocks.js')).mockReactI18next(),
)
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => navigateSpy }))
// Persisting the default play mode moved here from the (now removed) Settings →
// Playback section, so this is where the round-trip is asserted.
vi.mock('../../settings/data/settings-prefs.js', () => ({
  writeDefaultPlayMode: writePrefSpy,
}))
vi.mock('@lynx-js/lynx-ui-slider', async () =>
  (await import('../../../__tests__/_render-mocks.js')).mockLynxUiSlider(),
)
vi.mock('@lynx-js/lynx-ui-sheet', async () =>
  (await import('../../../__tests__/_render-mocks.js')).mockLynxUiSheet(),
)
vi.mock('@lynx-js/lynx-ui-swiper', async () =>
  (await import('../../../__tests__/_render-mocks.js')).mockLynxUiSwiper(),
)
vi.mock('../store/player-store.js', async () => {
  const actual = await vi.importActual<typeof import('../store/player-store.js')>(
    '../store/player-store.js',
  )
  const { makePlayerStoreMock } = await import('../../../__tests__/_render-mocks.js')
  return makePlayerStoreMock(actual)
})
vi.mock('../store/lyric-store.js', async () => {
  const actual = await vi.importActual<typeof import('../store/lyric-store.js')>(
    '../store/lyric-store.js',
  )
  const { makeLyricStoreMock } = await import('../../../__tests__/_render-mocks.js')
  return makeLyricStoreMock(actual)
})

const { FullPlayerPage } = await import('../pages/FullPlayerPage.js')

afterEach(() => vi.clearAllMocks())

async function renderPage() {
  render(<FullPlayerPage />)
  await act(async () => {
    await Promise.resolve()
  })
  return getQueriesForElement(elementTree.root!)
}

test('renders the now-playing header, song meta and transport', async () => {
  const { queryByText, queryAllByText, queryByTestId } = await renderPage()

  expect(queryByText('Now Playing')).toBeInTheDocument()
  // The mocked Sheet renders the drawer's queue too, so the title/artist also
  // appear in the (open, in-test) drawer row — assert at least one occurrence.
  expect(queryAllByText('Mock Song').length).toBeGreaterThan(0)
  expect(queryAllByText('Mock Artist').length).toBeGreaterThan(0)

  // Transport icons (paused mock state → play icon, not pause) + skip controls,
  // and the play-mode label (order mode → the "order" icon).
  expect(queryByTestId('icon-play')).toBeInTheDocument()
  expect(queryByTestId('icon-pause')).not.toBeInTheDocument()
  expect(queryByTestId('icon-skip-prev')).toBeInTheDocument()
  expect(queryByTestId('icon-skip-next')).toBeInTheDocument()
  expect(queryByTestId('icon-order')).toBeInTheDocument()
  expect(queryByText('Order')).toBeInTheDocument()
  // Topbar collapse + playlist icons.
  expect(queryByTestId('icon-chevron-down')).toBeInTheDocument()
  expect(queryByTestId('icon-menu')).toBeInTheDocument()
})

test('renders formatted current + total time from the store (30s / 200s)', async () => {
  const { queryByText } = await renderPage()
  expect(queryByText('00:30')).toBeInTheDocument()
  expect(queryByText('03:20')).toBeInTheDocument()
})

test('cycling the play mode also persists it as the default', async () => {
  const { queryByTestId } = await renderPage()

  await act(async () => {
    fireEvent.tap(queryByTestId('icon-order')!.parentElement!.parentElement!)
  })

  // The store mock leaves `playMode` at 'order', so that is what gets written —
  // the point is that a write happens at all. Before this moved out of Settings,
  // cycling the mode only touched memory and the pref never changed.
  expect(writePrefSpy).toHaveBeenCalledWith('order')
})

test('closing returns to the last shell tab rather than always home', async () => {
  const { setLastShellLocation } = await import('../../../shared/nav/shell-navigation.js')
  setLastShellLocation('/library')
  const { queryByTestId } = await renderPage()

  await act(async () => {
    fireEvent.tap(queryByTestId('full-player-close')!)
  })

  // `/library` also restores its remembered sub-tab, hence the `search` argument.
  expect(navigateSpy).toHaveBeenCalledWith({ to: '/library', search: {} })
})
