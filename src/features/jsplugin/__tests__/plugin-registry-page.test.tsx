import '../../../shims/router-env.js'

import '@testing-library/jest-dom'
import { afterEach, expect, test, vi } from 'vitest'
import { act, fireEvent, getQueriesForElement, render } from '@lynx-js/react/testing-library'

/**
 * The registry (plugin store) is a drill-in reached from the plugin manager.
 *
 * The behavior under test is the *navigation seam*: as a standalone route the
 * back affordance routes to `/settings/plugins`, but when the page is hosted in
 * the wide settings master–detail pane it must hand control back to the pane
 * (`onBack`) instead — routing would unmount SettingsPage and drop the settings
 * list (the wide-screen first-level menu). Mirrors `plugin-manager-page`'s
 * `onOpenStore` tests.
 */
const h = vi.hoisted(() => ({
  navigate: vi.fn(),
  refreshRegistry: vi.fn(async () => ({ plugins: [], total: 0, page: 1 })),
  install: vi.fn(),
}))

vi.mock('react-i18next', async () =>
  (await import('../../../__tests__/_render-mocks.js')).mockReactI18next(),
)

vi.mock('@lynx-js/lynx-ui-input', async () =>
  (await import('../../../__tests__/_render-mocks.js')).mockLynxUiInput(),
)

vi.mock('@tanstack/react-router', () => ({ useNavigate: () => h.navigate }))

vi.mock('../api/index.js', () => ({
  getJSPluginApi: () => ({ refreshRegistry: h.refreshRegistry }),
}))

vi.mock('../data/jsplugin-mutations.js', () => ({
  useInstallFromRegistryMutation: () => ({ mutate: h.install }),
}))

const { PluginRegistryPage } = await import('../pages/PluginRegistryPage.js')

afterEach(() => vi.clearAllMocks())

async function renderPage(props: { onBack?: () => void } = {}) {
  render(<PluginRegistryPage {...props} />)
  // Flush the auto-fetch kicked off during the first render.
  await act(async () => {
    for (let i = 0; i < 5; i++) await Promise.resolve()
  })
  return getQueriesForElement(elementTree.root!)
}

test('renders the store header and fetches on mount', async () => {
  const { queryByTestId } = await renderPage()
  expect(queryByTestId('registry-back')).toBeInTheDocument()
  expect(h.refreshRegistry).toHaveBeenCalled()
})

test('the back button routes when the page is standalone', async () => {
  const { getByTestId } = await renderPage()

  await act(async () => {
    fireEvent.tap(getByTestId('registry-back')!)
  })

  expect(h.navigate).toHaveBeenCalledWith({ to: '/settings/plugins' })
})

test('the back button defers to onBack inside the settings pane', async () => {
  const onBack = vi.fn()
  const { getByTestId } = await renderPage({ onBack })

  await act(async () => {
    fireEvent.tap(getByTestId('registry-back')!)
  })

  expect(onBack).toHaveBeenCalledTimes(1)
  expect(h.navigate).not.toHaveBeenCalled()
})
