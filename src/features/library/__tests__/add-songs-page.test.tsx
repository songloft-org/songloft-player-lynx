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

const { AddSongsPage } = await import('../pages/AddSongsPage.js')

async function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <AddSongsPage />
    </QueryClientProvider>,
  )
  await act(async () => { await Promise.resolve() })
  return getQueriesForElement(elementTree.root!)
}

test('renders add songs page with remote and radio tabs', async () => {
  const { queryByText } = await renderPage()

  expect(queryByText('Add Songs')).toBeInTheDocument()
  expect(queryByText('Remote')).toBeInTheDocument()
  expect(queryByText('Radio')).toBeInTheDocument()
  expect(queryByText('https://')).toBeInTheDocument()
})

/*
 * Content only. This page used to render its own copy of the library view rail,
 * gated on an async width store *and* on the browse-config query — which is what
 * made it flash on open. The rail belongs to `LibraryLayout` now, and a second one
 * here would double up on wide screens. Its absence is also why the page needs no
 * width knowledge at all.
 */
test('renders no view rail of its own — that belongs to the route layout', async () => {
  const { queryAllByTestId } = await renderPage()
  expect(queryAllByTestId(/^library-view-row-/)).toHaveLength(0)
})
