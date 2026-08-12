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
vi.mock('@lynx-js/lynx-ui-input', async () =>
  (await import('../../../__tests__/_render-mocks.js')).mockLynxUiInput(),
)
vi.mock('../api/index.js', () => ({
  getSongsApi: () => ({ addRemoteSongs: vi.fn(async () => {}), addRadioStations: vi.fn(async () => {}) }),
}))

const { AddSongsPage } = await import('../pages/AddSongsPage.js')

test('renders add songs page with remote and radio tabs', async () => {
  render(<AddSongsPage />)
  await act(async () => { await Promise.resolve() })
  const { queryByText } = getQueriesForElement(elementTree.root!)

  expect(queryByText('Add Songs')).toBeInTheDocument()
  expect(queryByText('Remote')).toBeInTheDocument()
  expect(queryByText('Radio')).toBeInTheDocument()
  expect(queryByText('https://')).toBeInTheDocument()
})
