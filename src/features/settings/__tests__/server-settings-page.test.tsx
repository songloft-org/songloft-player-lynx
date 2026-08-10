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
 * ServerSettingsPage render smoke.
 *
 * The page uses the lynx-ui native leaves `Input` + `Switch` (crash the Vitest
 * snapshot tree) → mocked to plain views via the shared `_render-mocks`
 * factories. `useNavigate` is a spy; `applyServerSettings` is a spy resolving a
 * normalized URL so Save's effect + navigation are observable without touching
 * `appConfig` / prefs. The real `SettingsRow`-free page structure runs; the
 * session store (`getState().setBaseUrl`) is left real (a plain setter).
 */
const { navigateSpy, applySpy } = vi.hoisted(() => ({
  navigateSpy: vi.fn(),
  applySpy: vi.fn(async () => 'http://host:58091'),
}))

vi.mock('react-i18next', async () =>
  (await import('../../../__tests__/_render-mocks.js')).mockReactI18next(),
)

vi.mock('@tanstack/react-router', () => ({ useNavigate: () => navigateSpy }))

vi.mock('@lynx-js/lynx-ui-input', async () =>
  (await import('../../../__tests__/_render-mocks.js')).mockLynxUiInput(),
)
vi.mock('@lynx-js/lynx-ui-switch', async () =>
  (await import('../../../__tests__/_render-mocks.js')).mockLynxUiSwitch(),
)

vi.mock('../data/settings-prefs.js', () => ({ applyServerSettings: applySpy }))

const { ServerSettingsPage } = await import('../pages/ServerSettingsPage.js')

afterEach(() => vi.clearAllMocks())

async function renderPage() {
  render(<ServerSettingsPage />)
  await act(async () => {
    await Promise.resolve()
  })
  return getQueriesForElement(elementTree.root!)
}

test('renders the address field, the insecure-TLS toggle and Save/back', async () => {
  const { queryByText, queryByTestId } = await renderPage()
  expect(queryByText('API base URL')).toBeInTheDocument()
  expect(queryByText('Allow insecure TLS')).toBeInTheDocument()
  expect(queryByTestId('server-save')).toBeInTheDocument()
  expect(queryByTestId('server-back')).toBeInTheDocument()
})

test('Save applies the server settings then routes back to /settings', async () => {
  const { queryByTestId } = await renderPage()
  await act(async () => {
    fireEvent.tap(queryByTestId('server-save')!)
    await Promise.resolve()
  })
  expect(applySpy).toHaveBeenCalledTimes(1)
  expect(navigateSpy).toHaveBeenCalledWith({ to: '/settings' })
})

test('the back affordance routes to /settings', async () => {
  const { queryByTestId } = await renderPage()
  await act(async () => {
    fireEvent.tap(queryByTestId('server-back')!)
  })
  expect(navigateSpy).toHaveBeenCalledWith({ to: '/settings' })
})
