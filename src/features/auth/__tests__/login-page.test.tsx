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
vi.mock('@lynx-js/lynx-ui-input', async () =>
  (await import('../../../__tests__/_render-mocks.js')).mockLynxUiInput(),
)
vi.mock('@lynx-js/lynx-ui-switch', async () =>
  (await import('../../../__tests__/_render-mocks.js')).mockLynxUiSwitch(),
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

test('standalone mode shows the API URL field + insecure-TLS toggle', async () => {
  appConfig.deployMode = 'standalone'
  const { queryByText } = await renderLogin()
  expect(queryByText('API base URL')).toBeInTheDocument()
  expect(queryByText('Allow insecure TLS')).toBeInTheDocument()
})
