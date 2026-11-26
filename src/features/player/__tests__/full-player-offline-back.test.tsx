import '@testing-library/jest-dom'

/*
 * Regression: an offline (device-cached) song used to hardcode the player's back
 * target to /device-cache, while online songs went through performRouteBack.
 * Playing a cached song from a playlist or folder then closing the player dumped
 * the user on the cache screen instead of the page they came from — the offline
 * twin of the "player always returns to Home" bug. This pins that both paths
 * now resolve through the shared back policy.
 */
vi.mock('../data/audio-tracks-query.js', () => ({
  useAudioTracks: () => ({ data: [], isPending: false, isError: false, refetch: async () => {} }),
}))
vi.mock('../store/dlna-store.js', async (original) => {
  const actual = await original<typeof import('../store/dlna-store.js')>()
  const { makeDlnaStoreMock } = await import('../../../__tests__/_render-mocks.js')
  return makeDlnaStoreMock(actual)
})
import { afterEach, expect, test, vi } from 'vitest'
import { act, fireEvent, getQueriesForElement, render } from '@lynx-js/react/testing-library'
import { installBackRouter } from '../../../__tests__/_render-mocks.js'
import { cacheIdentity, cacheNamespace } from '../domain/cache-identity.js'
import { mockSong } from '../../../__tests__/_render-mocks.js'

const offlineSong = {
  ...mockSong(),
  deviceCache: cacheIdentity({
    namespace: cacheNamespace({ profile: 'default', server: 'http://server', username: 'alice' }),
    song: mockSong(),
    variant: { track: null, quality: 'original', normalize: false },
    format: 'mp3',
  }),
}

const navigateSpy = vi.fn()

vi.mock('react-i18next', async () =>
  (await import('../../../__tests__/_render-mocks.js')).mockReactI18next(),
)
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigateSpy,
  useRouterState: () => '/player',
}))
vi.mock('../../settings/data/settings-prefs.js', () => ({
  writeDefaultPlayMode: vi.fn(),
  readAudioQuality: vi.fn(async () => 'original'),
  readNormalize: vi.fn(async () => false),
  readPlaybackSpeed: vi.fn(async () => 1),
  writePlaybackSpeed: vi.fn(async () => {}),
  readAutoEnterLyrics: vi.fn(async () => false),
  readFloatingLyricEnabled: vi.fn(async () => false),
}))
vi.mock('../../library/data/favorites.js', () => ({
  useIsFavorite: () => false,
  useFavoriteToggle: () => ({ isFavorite: false, toggle: vi.fn(), isPending: false }),
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
  return makePlayerStoreMock(actual, { currentSong: offlineSong, playlist: [offlineSong] })
})
vi.mock('../../../shared/ui/song-row-overlays.js', () => ({
  useSongRowOverlays: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ menuSong: null, menuView: 'menu', deleteSong: null,
      openMenu: vi.fn(), closeMenu: vi.fn(), requestDelete: vi.fn(), cancelDelete: vi.fn() }),
}))
vi.mock('../store/lyric-store.js', async () => {
  const actual = await vi.importActual<typeof import('../store/lyric-store.js')>(
    '../store/lyric-store.js',
  )
  const { makeLyricStoreMock } = await import('../../../__tests__/_render-mocks.js')
  return makeLyricStoreMock(actual)
})

const { FullPlayerPage } = await import('../pages/FullPlayerPage.js')
const { setLastContentLocation } = await import('../../../shared/nav/shell-navigation.js')

afterEach(() => vi.clearAllMocks())

test('closing an offline song returns to the source playlist, not /device-cache', async () => {
  const { setLastShellLocation } = await import('../../../shared/nav/shell-navigation.js')
  setLastShellLocation('/')
  // The user opened the player from a playlist detail page.
  setLastContentLocation({ pathname: '/playlists/7', search: {} })
  const navigate = installBackRouter('/player')

  render(<FullPlayerPage />)
  await act(async () => { await Promise.resolve() })
  const { queryByTestId } = getQueriesForElement(elementTree.root!)

  await act(async () => {
    fireEvent.tap(queryByTestId('full-player-close')!)
  })

  expect(navigate).toHaveBeenCalledWith({ to: '/playlists/7' })
  expect(navigate).not.toHaveBeenCalledWith({ to: '/device-cache' })
})
