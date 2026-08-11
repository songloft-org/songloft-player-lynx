import '../../../shims/router-env.js'

import '@testing-library/jest-dom'
import { afterEach, expect, test, vi } from 'vitest'
import {
  act,
  getQueriesForElement,
  render,
} from '@lynx-js/react/testing-library'
import { RouterProvider } from '@tanstack/react-router'

import { appConfig } from '../../../core/config/app-config.js'
import { createAppRouter } from '../../../router.js'

// The login screen depends on three facilities the ReactLynx Vitest env cannot
// run; all three are mocked to plain stand-ins here (shapes shared via
// `_render-mocks` so they cannot drift). See that file for the full rationale.
//
//  - lynx-ui `Input`: its mount effect calls native `NodesRef.invoke` → throws
//    "not implemented".
//  - lynx-ui `Switch`: drives the native gesture runtime.
//  - `useAuthStore` (zustand): subscribes via `useSyncExternalStore`, whose
//    post-mount consistency pass forces a second commit mid-lifecycle-flush and
//    trips the env's `isListHolder`/`parentNode` snapshot crash.
//
// The real components + store are used in build/dev/on-device.
vi.mock('react-i18next', async () =>
  (await import('../../../__tests__/_render-mocks.js')).mockReactI18next(),
)
vi.mock('@lynx-js/lynx-ui-input', async () =>
  (await import('../../../__tests__/_render-mocks.js')).mockLynxUiInput(),
)
vi.mock('@lynx-js/lynx-ui-switch', async () =>
  (await import('../../../__tests__/_render-mocks.js')).mockLynxUiSwitch(),
)
// Batch 5: the router now eagerly imports the /player route → FullPlayerPage,
// which pulls in the lynx-ui gesture leaves (Slider/Sheet/Swiper) at module
// load. Rendering the login screen *through the router* therefore evaluates
// them; mock them (they corrupt the reconciler otherwise), same as Input/Switch.
vi.mock('@lynx-js/lynx-ui-slider', async () =>
  (await import('../../../__tests__/_render-mocks.js')).mockLynxUiSlider(),
)
vi.mock('@lynx-js/lynx-ui-sheet', async () =>
  (await import('../../../__tests__/_render-mocks.js')).mockLynxUiSheet(),
)
vi.mock('@lynx-js/lynx-ui-swiper', async () =>
  (await import('../../../__tests__/_render-mocks.js')).mockLynxUiSwiper(),
)
vi.mock('../store/index.js', async () => {
  const actual =
    await vi.importActual<typeof import('../store/index.js')>('../store/index.js')
  const { makeAuthStoreMock } = await import('../../../__tests__/_render-mocks.js')
  return makeAuthStoreMock(actual)
})

/**
 * Login-page render smoke, reusing the batch-1 ReactLynx testing-library setup.
 * Rendered through the router at `/login`: the production auth store is still
 * `unknown` (no `checkAuth` runs here), so the guard allows the route.
 */
async function renderLogin() {
  const appRouter = createAppRouter(['/login'])
  await act(async () => {
    await appRouter.load()
  })
  render(<RouterProvider router={appRouter as never} />)
  await act(async () => {
    await Promise.resolve()
  })
  return { appRouter, ...getQueriesForElement(elementTree.root!) }
}

afterEach(() => {
  appConfig.reset()
})

test('renders the login page with title, labels and login button', async () => {
  const { appRouter, queryByText } = await renderLogin()
  expect(appRouter.state.location.pathname).toBe('/login')
  expect(queryByText('Songloft')).toBeInTheDocument()
  expect(queryByText('Sign in to continue')).toBeInTheDocument()
  expect(queryByText('Username')).toBeInTheDocument()
  expect(queryByText('Password')).toBeInTheDocument()
  expect(queryByText('Log in')).toBeInTheDocument()
})

/**
 * The dev credentials (`devCredentials` in app-config) are meant to make device
 * testing typing-free, so the form must be submittable straight after mount.
 * `canSubmit` requires a non-empty username *and* password, so an enabled login
 * button proves both prefills landed — the mocked `Input` does not render its
 * value, so this is the observable proxy for it.
 *
 * This also guards the flicker fix indirectly: the username prefill has to
 * arrive through the async chain, and if someone removes that tail the button
 * stays disabled here.
 */
test('dev credentials prefill both fields so the form is submittable on mount', async () => {
  const { queryByTestId } = await renderLogin()
  const button = queryByTestId('login-button')
  expect(button).toBeInTheDocument()
  expect(button?.className).not.toContain('login__button--disabled')
})

test('standalone mode shows the API URL field + insecure-TLS toggle', async () => {
  appConfig.deployMode = 'standalone'
  const { queryByText } = await renderLogin()
  expect(queryByText('API base URL')).toBeInTheDocument()
  expect(queryByText('Allow insecure TLS')).toBeInTheDocument()
})
