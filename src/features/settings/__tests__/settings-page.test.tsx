import '../../../shims/router-env.js'

import '@testing-library/jest-dom'
import { afterEach, expect, test, vi } from 'vitest'
import {
  act,
  fireEvent,
  getQueriesForElement,
  render,
} from '@lynx-js/react/testing-library'

/**
 * SettingsPage render smoke.
 *
 * The page reads two zustand stores via `getState()` (non-subscribing) and the
 * settings prefs (async I/O). To keep the render hermetic + deterministic:
 * - `@tanstack/react-router` `useNavigate` → a spy (assert navigation targets);
 * - `../../auth/store/index.js` → a minimal `useAuthStore.getState().logout`
 *   spy (the real logout does storage/network work);
 * - `../../player/store/player-store.js` → `makePlayerStoreMock` with a
 *   `setPlayMode` spy so selecting a mode is observable;
 * - `../data/settings-prefs.js` → `readDefaultPlayMode` resolving a known mode +
 *   a `writeDefaultPlayMode` spy.
 *
 * The real domain helpers (labels/icons), `SettingsSection`, `SettingsRow` and
 * `Icon` all run; assertions check the rendered structure + that interactions
 * call the correct store/config, not fixtures echoed back.
 */
const { navigateSpy, logoutSpy, setPlayModeSpy, writePrefSpy, readPref } = vi.hoisted(
  () => ({
    navigateSpy: vi.fn(),
    logoutSpy: vi.fn(),
    setPlayModeSpy: vi.fn(),
    writePrefSpy: vi.fn(),
    readPref: vi.fn(async () => 'random' as const),
  }),
)

vi.mock('@tanstack/react-router', () => ({ useNavigate: () => navigateSpy }))

vi.mock('../../auth/store/index.js', () => ({
  useAuthStore: { getState: () => ({ logout: logoutSpy }) },
}))

vi.mock('../../player/store/player-store.js', async () => {
  const { makePlayerStoreMock } = await import('../../../__tests__/_render-mocks.js')
  return makePlayerStoreMock({}, { playMode: 'order', setPlayMode: setPlayModeSpy })
})

vi.mock('../data/settings-prefs.js', () => ({
  readDefaultPlayMode: readPref,
  writeDefaultPlayMode: writePrefSpy,
}))

const { SettingsPage } = await import('../pages/SettingsPage.js')

afterEach(() => vi.clearAllMocks())

async function renderPage() {
  render(<SettingsPage />)
  await act(async () => {
    await Promise.resolve()
  })
  return getQueriesForElement(elementTree.root!)
}

test('renders every section, the play-mode options, version, server and log-out rows', async () => {
  const { queryByText, queryByTestId } = await renderPage()

  // Section headers.
  expect(queryByText('Playback')).toBeInTheDocument()
  expect(queryByText('Connection')).toBeInTheDocument()
  expect(queryByText('Appearance')).toBeInTheDocument()
  expect(queryByText('About')).toBeInTheDocument()
  expect(queryByText('More settings (coming later)')).toBeInTheDocument()
  expect(queryByText('Account')).toBeInTheDocument()

  // The four play-mode option rows.
  expect(queryByTestId('play-mode-order')).toBeInTheDocument()
  expect(queryByTestId('play-mode-loop')).toBeInTheDocument()
  expect(queryByTestId('play-mode-single')).toBeInTheDocument()
  expect(queryByTestId('play-mode-random')).toBeInTheDocument()

  // Persisted default (random) → that row shows the check glyph.
  expect(queryByTestId('icon-check')).toBeInTheDocument()

  // About shows the client version, and the log-out row is present.
  expect(queryByTestId('settings-version')).toBeInTheDocument()
  expect(queryByTestId('settings-server')).toBeInTheDocument()
  expect(queryByText('Log out')).toBeInTheDocument()
})

test('selecting a play mode applies it to the player store and persists it', async () => {
  const { queryByTestId } = await renderPage()

  await act(async () => {
    fireEvent.tap(queryByTestId('play-mode-loop')!)
  })

  expect(setPlayModeSpy).toHaveBeenCalledWith('loop')
  expect(writePrefSpy).toHaveBeenCalledWith('loop')
})

test('the server row navigates to the server sub-page', async () => {
  const { queryByTestId } = await renderPage()

  await act(async () => {
    fireEvent.tap(queryByTestId('settings-server')!)
  })

  expect(navigateSpy).toHaveBeenCalledWith({ to: '/settings/server' })
})

test('log out is a two-tap confirm that calls auth logout then routes to /login', async () => {
  const { queryByTestId, queryByText } = await renderPage()

  // First tap arms the confirm; no logout / navigation yet.
  await act(async () => {
    fireEvent.tap(queryByTestId('settings-logout')!)
  })
  expect(queryByText('Tap again to log out')).toBeInTheDocument()
  expect(logoutSpy).not.toHaveBeenCalled()
  expect(navigateSpy).not.toHaveBeenCalled()

  // Second tap logs out + routes to /login.
  await act(async () => {
    fireEvent.tap(queryByTestId('settings-logout')!)
  })
  expect(logoutSpy).toHaveBeenCalledTimes(1)
  expect(navigateSpy).toHaveBeenCalledWith({ to: '/login' })
})
