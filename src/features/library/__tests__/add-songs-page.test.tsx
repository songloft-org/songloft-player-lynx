import '../../../shims/router-env.js'
import '@testing-library/jest-dom'
import { expect, test, vi } from 'vitest'
import { act, getQueriesForElement, render } from '@lynx-js/react/testing-library'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

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
vi.mock('../data/library-browse-query.js', () => ({
  useLibraryBrowseConfigQuery: () => ({ data: null, isLoading: false, isError: false }),
  libraryBrowseConfigOrFallback: () => null,
}))

const { AddSongsPage } = await import('../pages/AddSongsPage.js')

test('renders add songs page with remote and radio tabs', async () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <AddSongsPage />
    </QueryClientProvider>,
  )
  await act(async () => { await Promise.resolve() })
  const { queryByText } = getQueriesForElement(elementTree.root!)

  expect(queryByText('Add Songs')).toBeInTheDocument()
  expect(queryByText('Remote')).toBeInTheDocument()
  expect(queryByText('Radio')).toBeInTheDocument()
  expect(queryByText('https://')).toBeInTheDocument()
})
