import '../../../shims/router-env.js'
import '@testing-library/jest-dom'
import { expect, test, vi } from 'vitest'
import { act, getQueriesForElement, render } from '@lynx-js/react/testing-library'

vi.mock('react-i18next', async () =>
  (await import('../../../__tests__/_render-mocks.js')).mockReactI18next(),
)
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
}))

vi.mock('../api/index.js', () => ({
  getSettingsApi: () => ({
    client: {
      get: vi.fn(async () => ({ data: { has_update: false, current_version: '2.1.0', latest_version: '2.1.0' } })),
      post: vi.fn(async () => ({ data: {} })),
    },
  }),
}))

const { UpgradePage } = await import('../pages/UpgradePage.js')

test('shows up-to-date when no update available', async () => {
  render(<UpgradePage />)
  await act(async () => { await new Promise(r => setTimeout(r, 10)) })
  const { queryByText } = getQueriesForElement(elementTree.root!)

  expect(queryByText('Backend Update')).toBeInTheDocument()
  expect(queryByText('Up to date')).toBeInTheDocument()
  expect(queryByText('2.1.0')).toBeInTheDocument()
})
