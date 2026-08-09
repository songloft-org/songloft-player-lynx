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
vi.mock('@lynx-js/lynx-ui-slider', async () =>
  (await import('./_render-mocks.js')).mockLynxUiSlider(),
)
vi.mock('@lynx-js/lynx-ui-sheet', async () =>
  (await import('./_render-mocks.js')).mockLynxUiSheet(),
)
vi.mock('@lynx-js/lynx-ui-swiper', async () =>
  (await import('./_render-mocks.js')).mockLynxUiSwiper(),
)
vi.mock('../features/player/store/player-store.js', async () => {
  const actual = await vi.importActual<
    typeof import('../features/player/store/player-store.js')
  >('../features/player/store/player-store.js')
  const { makePlayerStoreMock } = await import('./_render-mocks.js')
  return makePlayerStoreMock(actual)
})

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

test('drives a real bindtap on the list screen into the player route', async () => {
  // The auth store is still `unknown` here (no `checkAuth`), so the guard lets
  // `/` render. The login button now triggers `authStore.login()` (network), so
  // the bindtap -> router proof moves to the list screen's "Open player" button.
  const appRouter = createAppRouter(['/'])
  await act(async () => {
    await appRouter.load()
  })
  render(<RouterProvider router={appRouter as never} />)
  const { getByText } = getQueriesForElement(elementTree.root!)

  expect(appRouter.state.location.pathname).toBe('/')

  // Real bindtap on the lynx-ui Button, proving onClick -> navigate -> router.
  await act(async () => {
    fireEvent.tap(getByText('Open player'))
  })
  expect(appRouter.state.location.pathname).toBe('/player')
})

test('renders the list screen inside the shell (incl. lynx-ui button)', async () => {
  const { queryByText } = await renderRoute('/')
  // Unique to ListPage (its lynx-ui Button label).
  expect(queryByText('Open player')).toBeInTheDocument()
  expect(queryByText('Your songs will appear here')).toBeInTheDocument()
})

test('renders the chrome-less player screen', async () => {
  const { queryByText } = await renderRoute('/player')
  expect(queryByText('Now Playing')).toBeInTheDocument()
})
