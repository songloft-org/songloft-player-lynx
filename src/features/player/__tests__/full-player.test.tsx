import '@testing-library/jest-dom'
import { afterEach, expect, test, vi } from 'vitest'
import { act, fireEvent, getQueriesForElement, render } from '@lynx-js/react/testing-library'
import { installBackRouter } from '../../../__tests__/_render-mocks.js'

/**
 * FullPlayerPage render smoke. Same pattern as the library/login tests: the
 * lynx-ui native leaves (Slider/Sheet/Swiper) and the zustand player/lyric
 * subscriptions crash the ReactLynx Vitest tree, so they are mocked to static
 * stand-ins (real ones ship on-device). `useNavigate` is stubbed so the page can
 * render without a RouterProvider. Assertions check the real rendered structure
 * (title, artist, "Now Playing", play glyph, formatted times), not fixtures.
 */
const { navigateSpy, writePrefSpy, favoriteToggleSpy } = vi.hoisted(() => ({
  navigateSpy: vi.fn(),
  writePrefSpy: vi.fn(),
  favoriteToggleSpy: vi.fn(),
}))

vi.mock('react-i18next', async () =>
  (await import('../../../__tests__/_render-mocks.js')).mockReactI18next(),
)
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigateSpy,
}))
// Persisting the default play mode moved here from the (now removed) Settings →
// Playback section, so this is where the round-trip is asserted.
vi.mock('../../settings/data/settings-prefs.js', () => ({
  writeDefaultPlayMode: writePrefSpy,
  readAudioQuality: vi.fn(async () => 'original'),
  readNormalize: vi.fn(async () => false),
  readPlaybackSpeed: vi.fn(async () => 1),
  writePlaybackSpeed: vi.fn(async () => {}),
  readAutoEnterLyrics: vi.fn(async () => false),
}))
/*
 * Two react-query consumers now sit inside the player and would each throw
 * `No QueryClient set` here: the transport row's favorite button, and the
 * `SongRowOverlays` the overflow menu opens (its hooks run even while it is closed).
 * Favorites gets a typed stand-in; the rest goes through the same minimal
 * `@tanstack/react-query` stub `playlist-detail.test.tsx` uses.
 */
vi.mock('../../library/data/favorites.js', () => ({
  useIsFavorite: () => false,
  useFavoriteToggle: () => ({ isFavorite: false, toggle: favoriteToggleSpy, isPending: false }),
  getFavoriteState: async () => false,
  toggleFavoriteNonReact: async () => {},
}))
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useInfiniteQuery: () => ({ data: undefined, isLoading: false }),
  useQuery: () => ({ data: undefined, isLoading: false, isError: false, refetch: vi.fn() }),
  useMutation: () => ({ mutate: vi.fn(), isPending: false }),
}))
vi.mock('@lynx-js/lynx-ui-slider', async () =>
  (await import('../../../__tests__/_render-mocks.js')).mockLynxUiSlider(),
)
vi.mock('@lynx-js/lynx-ui-sheet', async () =>
  (await import('../../../__tests__/_render-mocks.js')).mockLynxUiSheet(),
)
vi.mock('@lynx-js/lynx-ui-sortable', async () =>
  (await import('../../../__tests__/_render-mocks.js')).mockLynxUiSortable(),
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

/*
 * The player's overflow menu dispatches the song actions to the global
 * overlays store (app-root mount). The zustand hook cannot run in this env,
 * same crash class as the player store above.
 */
vi.mock('../../../shared/ui/song-row-overlays.js', () => ({
  useSongRowOverlays: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      menuSong: null,
      menuView: 'menu',
      deleteSong: null,
      openMenu: vi.fn(),
      closeMenu: vi.fn(),
      requestDelete: vi.fn(),
      cancelDelete: vi.fn(),
    }),
}))
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
  const { queryByText, queryAllByText, queryByTestId, queryAllByTestId } = await renderPage()

  // Narrow (the env reports no width, so `mobile`): the header shows the **album**,
  // because the song title is already right below the cover. "Now Playing" is the
  // wide-layout header instead — asserted in `full-player-responsive.test.tsx`.
  expect(queryByText('Mock Album')).toBeInTheDocument()
  expect(queryByText('Now Playing')).not.toBeInTheDocument()
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
  // Exactly once: the popover starts closed, so the menu's own copy of the
  // order icon/label is not mounted.
  expect(queryByTestId('icon-order')).toBeInTheDocument()
  expect(queryAllByText('Order')).toHaveLength(1)
  // Topbar collapse + playlist icons (menu also appears on drag handles).
  expect(queryByTestId('icon-chevron-down')).toBeInTheDocument()
  expect(queryAllByTestId('icon-menu').length).toBeGreaterThanOrEqual(1)

  // The tool row: volume, speed and queue moved here out of the top bar, so their
  // absence would mean the controls went missing rather than merely moved.
  expect(queryByTestId('volume-btn')).toBeInTheDocument()
  expect(queryByTestId('speed-btn')).toBeInTheDocument()
  expect(queryByTestId('queue-btn')).toBeInTheDocument()
  // Favorite is new to the player — nothing else on this screen could favorite the
  // song that is actually playing.
  expect(queryByTestId('favorite-btn')).toBeInTheDocument()
  expect(queryByTestId('icon-heart')).toBeInTheDocument()
})

test('the favorite button toggles the song through the shared favorites hook', async () => {
  const { getByTestId } = await renderPage()

  await act(async () => {
    fireEvent.tap(getByTestId('favorite-btn'))
  })

  // Goes through `useFavoriteToggle`, so the player shares the query cache with the
  // library rather than keeping its own idea of what is favorited.
  expect(favoriteToggleSpy).toHaveBeenCalledTimes(1)
})

test('renders formatted current + total time from the store (30s / 200s)', async () => {
  const { queryByText } = await renderPage()
  expect(queryByText('00:30')).toBeInTheDocument()
  expect(queryByText('03:20')).toBeInTheDocument()
})

test('the play mode popover opens on tap and selecting a mode persists it', async () => {
  const { getByText, queryAllByText } = await renderPage()

  // Closed: only the trigger's own label for the current mode is rendered. The
  // other three modes exist solely as menu items, so their absence is what
  // proves the menu is shut — and their presence below is what proves the
  // trigger really opened it (it used to be wired to nothing at all).
  expect(queryAllByText('Repeat all')).toHaveLength(0)
  const trigger = getByText('Order').parentElement!

  await act(async () => {
    fireEvent.tap(trigger)
  })

  expect(queryAllByText('Repeat all')).toHaveLength(1)

  await act(async () => {
    fireEvent.tap(getByText('Repeat all').parentElement!)
  })

  // Persisted as the new default, and the menu closed itself again.
  expect(writePrefSpy).toHaveBeenCalledWith('loop')
  expect(queryAllByText('Repeat all')).toHaveLength(0)
})

test('the speed popover opens on tap and closes on select', async () => {
  const { getByText, getByTestId, queryAllByText } = await renderPage()

  // The trigger shows the current speed ('1x'); the choices only exist in the menu.
  expect(queryAllByText('1.5x')).toHaveLength(0)

  await act(async () => {
    fireEvent.tap(getByTestId('speed-btn').parentElement!)
  })

  expect(queryAllByText('1.5x')).toHaveLength(1)
  expect(queryAllByText('Normal')).toHaveLength(1)

  await act(async () => {
    fireEvent.tap(getByText('1.5x').parentElement!)
  })

  expect(queryAllByText('1.5x')).toHaveLength(0)
})

test('closing returns to the last shell tab rather than always home', async () => {
  const { setLastShellLocation } = await import('../../../shared/nav/shell-navigation.js')
  setLastShellLocation('/library')
  const navigate = installBackRouter('/player')
  const { queryByTestId } = await renderPage()

  await act(async () => {
    fireEvent.tap(queryByTestId('full-player-close')!)
  })

  // `/library` also restores its remembered sub-tab, hence the `search` argument.
  expect(navigate).toHaveBeenCalledWith({ to: '/library', search: {} })
})
