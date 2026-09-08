import '../../../shims/router-env.js'
import '@testing-library/jest-dom'

import { afterEach, expect, test, vi } from 'vitest'
import { act, fireEvent, getQueriesForElement, render } from '@lynx-js/react/testing-library'

import type { ServerProfile } from '../../../models/server-profile.js'
import type { ServerStoreState } from '../store/server-store.js'

/**
 * How the server list opens the add/edit form.
 *
 * The wide settings layout is a master–detail: the settings list is the left
 * column and sub-pages render in the right pane. A **third-level** page reached by
 * `navigate()` therefore does not "open in the pane" — it leaves `/settings`
 * entirely, which unmounts the master–detail page and takes the settings list off
 * screen with it. That is what the add-server and edit-server buttons used to do,
 * and it was reported as "the third-level page covers the settings tabs".
 *
 * Every other third-level settings page had already been converted to the callback
 * shape (`onOpenDuplicates`, `onOpenStore`, `onOpenLicenses`, `onOpenCatalog`); the
 * server form was the last one still routing. So the assertions come in pairs: with
 * a callback (the pane) nothing may route; without one (a standalone narrow-screen
 * route) the route must still be taken.
 *
 * Reverse-verified: restoring the direct `navigate({ to: '/settings/servers/add' })`
 * makes both pane tests fail (the callback is never called, and `navigate` is).
 *
 * The store is stubbed rather than driven: `ServerListPage` reads it through
 * subscribing selectors, and a real zustand subscription crashes the ReactLynx
 * snapshot tree (the reason `SettingsPage` restricts itself to vanilla reads).
 */

const PROFILES: ServerProfile[] = [
  { id: 'srv_active', name: 'Home', url: 'http://home:8080', insecureTls: false, lastUsed: undefined },
  { id: 'srv_other', name: 'LAN', url: 'https://lan:8443', insecureTls: true, lastUsed: undefined },
]

const { navigateSpy, hydrateSpy } = vi.hoisted(() => ({
  navigateSpy: vi.fn(),
  hydrateSpy: vi.fn(async () => {}),
}))

vi.mock('@tanstack/react-router', () => ({ useNavigate: () => navigateSpy }))

vi.mock('react-i18next', async () =>
  (await import('../../../__tests__/_render-mocks.js')).mockReactI18next(),
)

vi.mock('../store/server-store.js', () => {
  const state = {
    profiles: PROFILES,
    activeProfileId: 'srv_active',
    hydrate: hydrateSpy,
  } as unknown as ServerStoreState

  function useServerStore<T>(selector?: (s: ServerStoreState) => T): T | ServerStoreState {
    return selector ? selector(state) : state
  }
  useServerStore.getState = (): ServerStoreState => state
  useServerStore.setState = (): void => {}
  useServerStore.subscribe = (): (() => void) => () => {}

  return { useServerStore }
})

const { ServerListPage } = await import('../pages/ServerListPage.js')

afterEach(() => vi.clearAllMocks())

/** Render and return the element queries, with `hydrate`'s effect flushed. */
async function renderList(props: { onOpenServerForm?: (id?: string) => void } = {}) {
  await act(async () => { render(<ServerListPage {...props} />) })
  return getQueriesForElement(elementTree.root!)
}

test('add opens the form in the pane, without leaving /settings', async () => {
  const onOpenServerForm = vi.fn()
  const { getByTestId } = await renderList({ onOpenServerForm })

  await act(async () => { fireEvent.tap(getByTestId('servers-add')) })

  // No argument: "add", as opposed to editing an existing profile.
  expect(onOpenServerForm).toHaveBeenCalledTimes(1)
  expect(onOpenServerForm).toHaveBeenCalledWith()
  expect(navigateSpy).not.toHaveBeenCalled()
})

test('edit opens the form in the pane, carrying which profile', async () => {
  const onOpenServerForm = vi.fn()
  const { getByTestId } = await renderList({ onOpenServerForm })

  // Only non-active profiles expose the edit/delete actions.
  await act(async () => { fireEvent.tap(getByTestId('server-edit-srv_other')) })

  expect(onOpenServerForm).toHaveBeenCalledWith('srv_other')
  expect(navigateSpy).not.toHaveBeenCalled()
})

test('add routes when there is no pane', async () => {
  const { getByTestId } = await renderList()

  await act(async () => { fireEvent.tap(getByTestId('servers-add')) })

  expect(navigateSpy).toHaveBeenCalledWith({ to: '/settings/servers/add' })
})

test('edit routes when there is no pane', async () => {
  const { getByTestId } = await renderList()

  await act(async () => { fireEvent.tap(getByTestId('server-edit-srv_other')) })

  expect(navigateSpy).toHaveBeenCalledWith({
    to: '/settings/servers/edit/$id',
    params: { id: 'srv_other' },
  })
})

test('hydrates the profile list on mount', async () => {
  await renderList()
  expect(hydrateSpy).toHaveBeenCalled()
})
