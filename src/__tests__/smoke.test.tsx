import '../shims/router-env.js'

import '@testing-library/jest-dom'
import { expect, test, vi } from 'vitest'
import {
  act,
  fireEvent,
  getQueriesForElement,
  render,
} from '@lynx-js/react/testing-library'
import { RouterProvider } from '@tanstack/react-router'

import { App } from '../App.js'
import { createAppRouter, router } from '../router.js'

// Rendering `/login` (via <App/> or the router) pulls in facilities the
// ReactLynx Vitest env cannot run — the lynx-ui native leaves `Input`/`Switch`
// and the zustand `useAuthStore` subscription (`useSyncExternalStore`). Left
// real, any one crashes the shared snapshot tree (`isListHolder`/`parentNode`)
// and poisons later tests. Mock all three to plain stand-ins (shapes shared via
// `_render-mocks`); the real components + store are used in build/dev/on-device.
// See `_render-mocks.tsx` for the full rationale.
// i18n: mock react-i18next to a deterministic English `t` (real English
// resource values) — `useTranslation` subscribes to i18next + needs a global
// instance; the shell + every page under the router use it. See `_render-mocks`.
vi.mock('react-i18next', async () =>
  (await import('./_render-mocks.js')).mockReactI18next(),
)
vi.mock('@lynx-js/lynx-ui-input', async () =>
  (await import('./_render-mocks.js')).mockLynxUiInput(),
)
vi.mock('@lynx-js/lynx-ui-switch', async () =>
  (await import('./_render-mocks.js')).mockLynxUiSwitch(),
)
vi.mock('../features/auth/store/index.js', async () => {
  const actual = await vi.importActual<
    typeof import('../features/auth/store/index.js')
  >('../features/auth/store/index.js')
  const { makeAuthStoreMock } = await import('./_render-mocks.js')
  return makeAuthStoreMock(actual)
})

// Batch 5: the shell mini-player + the /player screen add lynx-ui native leaves
// (Slider/Sheet/Swiper) and the zustand player store — same crash class as the
// login screen. Mock them to static stand-ins (real ones ship on-device).
// The player's transport row favorites the current song through react-query. In this
// env a fresh store subscription forces the second synchronous commit that trips the
// ReactLynx snapshot bug (see `_render-mocks.tsx`), so it is stubbed like the stores are.
vi.mock('../features/library/data/favorites.js', () => ({
  useIsFavorite: () => false,
  useFavoriteToggle: () => ({ isFavorite: false, toggle: vi.fn(), isPending: false }),
  getFavoriteState: async () => false,
  toggleFavoriteNonReact: async () => {},
}))

vi.mock('@lynx-js/lynx-ui-slider', async () =>
  (await import('./_render-mocks.js')).mockLynxUiSlider(),
)
vi.mock('@lynx-js/lynx-ui-sheet', async () =>
  (await import('./_render-mocks.js')).mockLynxUiSheet(),
)
vi.mock('@lynx-js/lynx-ui-swiper', async () =>
  (await import('./_render-mocks.js')).mockLynxUiSwiper(),
)
vi.mock('@lynx-js/lynx-ui-sortable', async () =>
  (await import('./_render-mocks.js')).mockLynxUiSortable(),
)
vi.mock('../features/player/store/player-store.js', async () => {
  const actual = await vi.importActual<
    typeof import('../features/player/store/player-store.js')
  >('../features/player/store/player-store.js')
  const { makePlayerStoreMock } = await import('./_render-mocks.js')
  return makePlayerStoreMock(actual)
})

// Batch 7: `/` is now the home page, whose sections read the playlist infinite
// query (`useHomePlaylists` → `useSyncExternalStore`, same crash class + needs a
// live QueryClient). Stub the hook to a static infinite-query shape so the shell
// route renders without a QueryClient; the real hook ships on-device.
vi.mock('../features/home/data/home-query.js', () => ({
  useHomePlaylists: () => ({
    data: {
      pages: [
        {
          playlists: [
            {
              id: 1,
              type: 'normal',
              name: 'Morning Mix',
              labels: [],
              songCount: 3,
              sortBy: 'position',
              sortOrder: 'asc',
              createdAt: '',
              updatedAt: '',
              isBuiltIn: false,
              isAutoCreated: false,
              isHidden: false,
            },
          ],
          total: 1,
        },
      ],
    },
    isLoading: false,
    isError: false,
    refetch: () => {},
  }),
}))

// Batch 20: the home stats panel reads `/songs/stats` through `useQuery`, which
// needs a live QueryClient this env does not provide — left real it throws inside
// render and corrupts the shared snapshot tree for every later test in the file.
vi.mock('../features/home/data/home-stats-query.js', () => ({
  useLibraryStatsQuery: () => ({
    data: {
      totalSongs: 60,
      localSongs: 0,
      remoteSongs: 60,
      radioSongs: 0,
      artistCount: 27,
      albumCount: 58,
      genreCount: 0,
      totalDuration: 9643,
      totalFileSize: 0,
    },
    refetch: () => {},
  }),
}))

vi.mock('../features/jsplugin/widgets/PluginGrid.js', () => ({
  PluginGrid: () => null,
}))

vi.mock('../features/jsplugin/index.js', () => ({
  useShellNavTabs: () => ({ data: undefined }),
  PluginTabIcon: () => null,
  PluginManagerPage: () => null,
  PluginRegistryPage: () => null,
  PluginWebViewPage: () => null,
  TabConfigPage: () => null,
}))

// The root route mounts the global `<ToastHost/>`, which subscribes to a zustand
// store (`useSyncExternalStore`) — the same crash class as the auth store above.
// Stand it in with a no-op; toast behaviour is covered by toast-store.test.ts.
vi.mock('../shared/ui/ToastHost.js', async () =>
  (await import('./_render-mocks.js')).mockToastHost(),
)

// The root route also mounts the song-row overlays (`SongRowOverlays`), whose
// zustand subscription is that same crash class. No-op here; the overlays'
// own behaviour is covered by song-list-row.test.tsx against the real store.
vi.mock('../shared/ui/SongRowOverlays.js', () => ({
  SongRowOverlays: () => null,
}))

// The player's overflow menu (and the song rows inside the history panel)
// dispatch through the overlays store — the zustand hook is the same crash
// class, so it is mocked to a static state no component will act on.
vi.mock('../shared/ui/song-row-overlays.js', () => ({
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

/**
 * Renders a fresh app router seeded at `entry` (memory history) and returns the
 * queries bound to the rendered tree.
 *
 * We render each screen from its own pre-loaded router rather than re-rendering
 * a single router across navigations: under the Vitest + ReactLynx dual-thread
 * environment, TanStack Router's post-mount async re-load pipeline does not
 * re-resolve matches (it works in the real Lynx build and dev server). Route
 * *config* and navigation *wiring* are still exercised — see the wiring test
 * below, which drives a real `bindtap` and asserts the router transitions.
 */
async function renderRoute(entry: string) {
  const appRouter = createAppRouter([entry])
  await act(async () => {
    await appRouter.load()
  })
  render(<RouterProvider router={appRouter as never} />)
  await act(async () => {
    await Promise.resolve()
  })
  return getQueriesForElement(elementTree.root!)
}

test('renders the App at the initial /login route', async () => {
  await act(async () => {
    await router.load()
  })
  render(<App />)
  const { findByText } = getQueriesForElement(elementTree.root!)
  expect(await findByText('Sign in to continue')).toBeInTheDocument()
})

test('drives a real bindtap on the home screen into the library route', async () => {
  // The auth store is still `unknown` here (no `checkAuth`), so the guard lets
  // `/` render. The home "View all" affordance is a plain `bindtap` → navigate,
  // so it proves the tap -> navigate -> router transition end to end.
  const appRouter = createAppRouter(['/'])
  await act(async () => {
    await appRouter.load()
  })
  render(<RouterProvider router={appRouter as never} />)
  const { getAllByText } = getQueriesForElement(elementTree.root!)

  expect(appRouter.state.location.pathname).toBe('/')

  // Real bindtap on a section's "View all", proving bindtap -> navigate -> router.
  await act(async () => {
    fireEvent.tap(getAllByText('View all')[0]!)
  })
  expect(appRouter.state.location.pathname).toBe('/library')
})

test('renders the home screen inside the shell', async () => {
  const { queryByTestId, queryByText, getAllByText } = await renderRoute('/')
  // The greeting + both section titles + a playlist card fed by the (stubbed)
  // query (the stub feeds both sections, so the card name appears per section).
  expect(queryByTestId('home-greeting')).toBeInTheDocument()
  expect(queryByText('My Playlists')).toBeInTheDocument()
  expect(queryByText('My Radios')).toBeInTheDocument()
  expect(getAllByText('Morning Mix').length).toBeGreaterThan(0)
})

test('renders the chrome-less player screen', async () => {
  const { queryByTestId } = await renderRoute('/player')
  // The collapse button rather than the header text: the header is the album on narrow
  // layouts and "Now Playing" only on wide ones, and this env reports no width.
  expect(queryByTestId('full-player-close')).toBeInTheDocument()
})
