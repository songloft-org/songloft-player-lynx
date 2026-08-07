import '../shims/router-env.js'

import '@testing-library/jest-dom'
import { expect, test } from 'vitest'
import {
  act,
  fireEvent,
  getQueriesForElement,
  render,
} from '@lynx-js/react/testing-library'
import { RouterProvider } from '@tanstack/react-router'

import { App } from '../App.js'
import { createAppRouter, router } from '../router.js'

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

test('navigates login -> list -> player via the router', async () => {
  const appRouter = createAppRouter(['/login'])
  await act(async () => {
    await appRouter.load()
  })
  render(<RouterProvider router={appRouter as never} />)
  const { getByText } = getQueriesForElement(elementTree.root!)

  // Start on /login.
  expect(appRouter.state.location.pathname).toBe('/login')

  // Hop 1 (login -> list): driven by a real bindtap on the login action,
  // proving the Link/navigate -> bindtap mapping reaches the router.
  await act(async () => {
    fireEvent.tap(getByText('Log in'))
  })
  expect(appRouter.state.location.pathname).toBe('/')

  // Hop 2 (list -> player).
  await act(async () => {
    await appRouter.navigate({ to: '/player' })
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
