import '../../../shims/router-env.js'

import '@testing-library/jest-dom'
import { afterEach, expect, test, vi } from 'vitest'
import { act, fireEvent, getQueriesForElement, render } from '@lynx-js/react/testing-library'

/**
 * LogsPage render smoke (batch 15). `getSettingsApi` is mocked so the three
 * states (loading/loaded/error) are each directly observable without a real
 * transport. `useNavigate` is a spy — `logs-back` just needs to route to
 * `/settings`, mirrors the ServerSettingsPage test pattern.
 */
const { navigateSpy, exportLogsSpy } = vi.hoisted(() => ({
  navigateSpy: vi.fn(),
  exportLogsSpy: vi.fn(async () => 'line one\nline two\n'),
}))

vi.mock('react-i18next', async () =>
  (await import('../../../__tests__/_render-mocks.js')).mockReactI18next(),
)

vi.mock('@tanstack/react-router', () => ({ useNavigate: () => navigateSpy }))

vi.mock('../api/index.js', () => ({
  getSettingsApi: () => ({ exportLogs: exportLogsSpy }),
}))

const { LogsPage } = await import('../pages/LogsPage.js')

afterEach(() => vi.clearAllMocks())

async function renderPage() {
  render(<LogsPage />)
  await act(async () => {
    await Promise.resolve()
  })
  return getQueriesForElement(elementTree.root!)
}

test('renders the fetched log text once loaded', async () => {
  const { queryByTestId } = await renderPage()
  expect(exportLogsSpy).toHaveBeenCalledTimes(1)
  expect(queryByTestId('logs-text')?.textContent).toBe('line one\nline two\n')
})

test('renders an empty state when the backend returns no logs', async () => {
  exportLogsSpy.mockResolvedValueOnce('')
  const { queryByTestId } = await renderPage()
  expect(queryByTestId('logs-empty')).toBeInTheDocument()
})

test('renders an error state when the fetch rejects', async () => {
  exportLogsSpy.mockRejectedValueOnce(new Error('offline'))
  const { queryByTestId } = await renderPage()
  expect(queryByTestId('logs-error')).toBeInTheDocument()
})

test('the back affordance routes to /settings', async () => {
  const { queryByTestId } = await renderPage()
  await act(async () => {
    fireEvent.tap(queryByTestId('logs-back')!)
  })
  expect(navigateSpy).toHaveBeenCalledWith({ to: '/settings' })
})
