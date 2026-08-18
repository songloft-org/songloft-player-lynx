import '../../../shims/router-env.js'
import '@testing-library/jest-dom'
import { afterEach, expect, test, vi } from 'vitest'
import { act, fireEvent, getQueriesForElement, render } from '@lynx-js/react/testing-library'

const { navigateSpy, getVersionSpy } = vi.hoisted(() => ({
  navigateSpy: vi.fn(),
  getVersionSpy: vi.fn(async () => '2.9.1'),
}))

vi.mock('react-i18next', async () =>
  (await import('../../../__tests__/_render-mocks.js')).mockReactI18next(),
)
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => navigateSpy }))
vi.mock('../api/index.js', () => ({
  getSettingsApi: () => ({ getVersion: getVersionSpy }),
}))

const { AboutPage } = await import('../pages/AboutPage.js')
const { clientVersion } = await import('../../../core/config/constants.js')

afterEach(() => vi.clearAllMocks())

async function renderPage(props: { onOpenLicenses?: () => void } = {}) {
  render(<AboutPage {...props} />)
  await act(async () => { await Promise.resolve() })
  return getQueriesForElement(elementTree.root!)
}

test('shows the client version and the backend version once it resolves', async () => {
  const { queryByTestId, queryByText } = await renderPage()

  expect(queryByTestId('settings-version')).toBeInTheDocument()
  expect(queryByText(clientVersion)).toBeInTheDocument()
  expect(queryByText('2.9.1')).toBeInTheDocument()
})

test('the licenses row routes when rendered as its own page', async () => {
  const { queryByTestId } = await renderPage()

  await act(async () => { fireEvent.tap(queryByTestId('settings-licenses')!) })

  expect(navigateSpy).toHaveBeenCalledWith({ to: '/settings/licenses' })
})

test('the licenses row defers to onOpenLicenses inside the settings pane', async () => {
  // In the pane, routing to `/settings/licenses` would unmount the whole
  // master–detail page and drop the settings list — so the drill-in has to stay a
  // swap within the pane (53fb045).
  const onOpenLicenses = vi.fn()
  const { queryByTestId } = await renderPage({ onOpenLicenses })

  await act(async () => { fireEvent.tap(queryByTestId('settings-licenses')!) })

  expect(onOpenLicenses).toHaveBeenCalledTimes(1)
  expect(navigateSpy).not.toHaveBeenCalled()
})
