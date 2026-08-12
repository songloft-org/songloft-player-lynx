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
  getThemePacksApi: () => ({
    list: vi.fn(async () => [
      { id: 1, themeId: 'ocean', name: 'Ocean', author: 'Test', description: '', version: '1.0', schemaVersion: 1, createdAt: '', updatedAt: '' },
    ]),
    getActive: vi.fn(async () => ({ themeId: 'ocean' })),
    activate: vi.fn(async () => {}),
    resetToDefault: vi.fn(async () => {}),
    deletePack: vi.fn(async () => {}),
    refreshCatalog: vi.fn(async () => []),
    installFromCatalog: vi.fn(async () => {}),
  }),
}))

const { ThemePacksPage } = await import('../pages/ThemePacksPage.js')

test('renders installed theme packs with active indicator', async () => {
  render(<ThemePacksPage />)
  await act(async () => { await new Promise(r => setTimeout(r, 10)) })
  const { queryByText } = getQueriesForElement(elementTree.root!)

  expect(queryByText('Theme Packs')).toBeInTheDocument()
  expect(queryByText('Default')).toBeInTheDocument()
  expect(queryByText('Ocean')).toBeInTheDocument()
})
