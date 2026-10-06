import '../shims/router-env.js'

import '@testing-library/jest-dom'
import { afterEach, beforeAll, expect, test, vi } from 'vitest'
import { act, cleanup, getQueriesForElement, render } from '@lynx-js/react/testing-library'

import { RootRouteView } from '../router.js'
import { setMockAuthStatus } from './_render-mocks.js'

/**
 * The splash gate: `RootRouteView` must paint the launch splash — and nothing
 * else — for every (status × pathname) pair that `isAuthTransitionPending`
 * calls "not yet decided". This is the render-layer half of the Web-refresh
 * "login page flashes" fix; the pure-function half is pinned in
 * `auth-guard.test.ts`.
 *
 * Testing the view directly (router hooks mocked) is what lets us hold the
 * router ON the pre-redirect pathname: through the real router, `beforeLoad`
 * would already have moved `authenticated @ /login` off `/login`, so the very
 * gap this file pins — status flipped, `router.invalidate()` still one
 * promise-chain tick away — cannot be staged any other way.
 */
const mockLocation = vi.hoisted(() => ({ pathname: '/login' }))

vi.mock('@tanstack/react-router', async () => {
  const actual =
    await vi.importActual<typeof import('@tanstack/react-router')>(
      '@tanstack/react-router',
    )
  return {
    ...actual,
    // The real hook subscribes to router state; this one just reads the
    // pathname the test pinned, so each scenario can sit on the pre-redirect
    // location.
    useRouterState: ({ select }: { select: (s: unknown) => unknown }) =>
      select({ location: { pathname: mockLocation.pathname } }),
    // Marked content standing in for the matched route component.
    Outlet: () => (
      <view>
        <text>ROUTE_OUTLET</text>
      </view>
    ),
  }
})

vi.mock('react-i18next', async () =>
  (await import('./_render-mocks.js')).mockReactI18next(),
)
vi.mock('../features/auth/store/index.js', async () => {
  const actual = await vi.importActual<
    typeof import('../features/auth/store/index.js')
  >('../features/auth/store/index.js')
  const { makeAuthStoreMock } = await import('./_render-mocks.js')
  return makeAuthStoreMock(actual)
})
// ToastHost / SongRowOverlays are not under test here and their zustand
// subscriptions crash the ReactLynx Vitest snapshot tree — stand them in
// (same as every other router-level render test).
vi.mock('../shared/ui/ToastHost.js', async () =>
  (await import('./_render-mocks.js')).mockToastHost(),
)
vi.mock('../shared/ui/SongRowOverlays.js', () => ({
  SongRowOverlays: () => null,
}))
vi.mock('../features/player/widgets/AudioTrackSheet.js', () => ({
  AudioTrackSheet: () => null,
}))

async function renderRoot() {
  render(<RootRouteView />)
  await act(async () => {
    await Promise.resolve()
  })
  return getQueriesForElement(elementTree.root!)
}

/**
 * The mock auth store is a static non-subscribing reader, so the status has to
 * be pinned BEFORE `render()`; the mocked `useRouterState` reads the pathname
 * at call time, so pinning it here covers the whole render.
 */
function pin(
  status: 'unknown' | 'authenticated' | 'unauthenticated',
  pathname: string,
) {
  setMockAuthStatus(status)
  mockLocation.pathname = pathname
}

afterEach(() => {
  setMockAuthStatus('unknown')
  mockLocation.pathname = '/login'
})

test("warm-up: the file's first mount never reaches elementTree", async () => {
  // This environment applies the FIRST mount commit's element patches only
  // from the next test on: right after it, `elementTree.root` is an empty
  // page, and neither waiting (findBy 1s) nor re-rendering inside the same
  // test (second render, rerender-remount) nor a beforeAll warm-up (+cleanup)
  // makes it queryable — verified experimentally, all four leave the tree
  // empty. Sibling of the isListHolder quirk documented atop
  // `_render-mocks.tsx`. Render once here with no content assertions so every
  // real scenario below starts from a working element pipeline.
  pin('unknown', '/login')
  await renderRoot()
})

test('unknown holds the splash — no route paints before auth resolves', async () => {
  // Memory history boots at /login; before checkAuth() resolves that must not
  // render the login card.
  pin('unknown', '/login')
  const { queryByTestId, queryByText } = await renderRoot()
  expect(queryByTestId('splash')).toBeInTheDocument()
  expect(queryByText('ROUTE_OUTLET')).not.toBeInTheDocument()
})

test('authenticated on /login still holds the splash until the redirect lands', async () => {
  // The regression this gate exists for: checkAuth() resolved, but
  // router.invalidate() has not moved the pathname yet. Painting /login in
  // this gap is precisely the "login flashes, then home" bug.
  pin('authenticated', '/login')
  const { queryByTestId, queryByText } = await renderRoot()
  expect(queryByTestId('splash')).toBeInTheDocument()
  expect(queryByText('ROUTE_OUTLET')).not.toBeInTheDocument()
})

test('unauthenticated on a protected route holds the splash', async () => {
  // Logout mid-app: status flips before the redirect to /login lands.
  pin('unauthenticated', '/library')
  const { queryByTestId, queryByText } = await renderRoot()
  expect(queryByTestId('splash')).toBeInTheDocument()
  expect(queryByText('ROUTE_OUTLET')).not.toBeInTheDocument()
})

test('settled: unauthenticated on /login renders the route', async () => {
  pin('unauthenticated', '/login')
  const { queryByTestId, queryByText } = await renderRoot()
  expect(queryByText('ROUTE_OUTLET')).toBeInTheDocument()
  expect(queryByTestId('splash')).not.toBeInTheDocument()
})

test('settled: authenticated on / renders the route', async () => {
  pin('authenticated', '/')
  const { queryByTestId, queryByText } = await renderRoot()
  expect(queryByText('ROUTE_OUTLET')).toBeInTheDocument()
  expect(queryByTestId('splash')).not.toBeInTheDocument()
})
