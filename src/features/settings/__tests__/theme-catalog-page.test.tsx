import '../../../shims/router-env.js'
import '@testing-library/jest-dom'
import { beforeEach, expect, test, vi } from 'vitest'
import { act, fireEvent, getQueriesForElement, render } from '@lynx-js/react/testing-library'

import type { ThemeCatalogEntry } from '../api/theme-packs-api.js'

vi.mock('react-i18next', async () =>
  (await import('../../../__tests__/_render-mocks.js')).mockReactI18next(),
)

const catalogRefresh = vi.fn(async (): Promise<ThemeCatalogEntry[]> => [])
const installFromCatalog = vi.fn(async (_entry: ThemeCatalogEntry): Promise<void> => {})

vi.mock('../api/index.js', () => ({
  getThemePacksApi: () => ({
    list: vi.fn(async () => []),
    deletePack: vi.fn(async () => {}),
    refreshCatalog: catalogRefresh,
    installFromCatalog,
  }),
}))

const { ThemeCatalogPage } = await import('../pages/ThemeCatalogPage.js')

beforeEach(() => {
  // The spies are module-level (shared across the file), so their call counts
  // and mock implementations must reset between tests.
  vi.clearAllMocks()
  catalogRefresh.mockReset().mockResolvedValue([])
  installFromCatalog.mockReset().mockResolvedValue(undefined)
})

async function flush(ms = 10) {
  await act(async () => { await new Promise(r => setTimeout(r, ms)) })
}

function queries() {
  return getQueriesForElement(elementTree.root!)
}

test('a failed catalog fetch shows the error and a retry, not "no themes"', async () => {
  catalogRefresh.mockRejectedValueOnce(new Error('GitHub unreachable'))

  render(<ThemeCatalogPage />)
  await flush()

  const { queryByText } = queries()
  // This is the regression the whole tri-state exists for: the old code
  // swallowed the error into an empty list and rendered "no themes".
  expect(queryByText(/Failed to load the catalog/)).toBeInTheDocument()
  expect(queryByText('No themes available.')).not.toBeInTheDocument()
  expect(queryByText('Retry')).toBeInTheDocument()

  // Retry hits the endpoint again.
  catalogRefresh.mockResolvedValueOnce([])
  await act(async () => { fireEvent.tap(queries().getByText('Retry')!) })
  await flush()
  expect(catalogRefresh).toHaveBeenCalledTimes(2)
})

test('catalog rows reflect their install state', async () => {
  catalogRefresh.mockResolvedValueOnce([
    { id: 'sakura', name: 'Sakura', version: '1.0.0', author: 'Songloft', description: '', url: 'https://example.com/sakura.json', sha256: 'abc', installState: 'not_installed' },
    { id: 'neon', name: 'Neon Night', version: '1.0.0', author: 'Songloft', description: '', url: 'https://example.com/neon.json', sha256: 'def', installState: 'installed' },
    { id: 'forest', name: 'Forest', version: '2.0.0', author: 'Songloft', description: '', url: 'https://example.com/forest.json', sha256: 'xyz', installState: 'has_update' },
  ] satisfies ThemeCatalogEntry[])

  render(<ThemeCatalogPage />)
  await flush()

  const { queryByText } = queries()
  expect(queryByText('Theme Catalog')).toBeInTheDocument()
  expect(queryByText('Sakura')).toBeInTheDocument()
  expect(queryByText('Neon Night')).toBeInTheDocument()
  expect(queryByText('Forest')).toBeInTheDocument()
  // `installed` is a label; `not_installed`/`has_update` are buttons.
  expect(queryByText('Installed')).toBeInTheDocument()
  expect(queryByText('Update')).toBeInTheDocument()
  expect(queryByText('Install')).toBeInTheDocument()
})

test('installing from the catalog re-pulls it so the row state updates', async () => {
  catalogRefresh.mockResolvedValue([
    { id: 'sakura', name: 'Sakura', version: '1.0.0', author: 'Songloft', description: '', url: 'https://example.com/sakura.json', sha256: 'abc', installState: 'not_installed' },
  ] satisfies ThemeCatalogEntry[])

  render(<ThemeCatalogPage />)
  await flush()

  await act(async () => { fireEvent.tap(queries().getByText('Install')!) })
  await flush()

  expect(installFromCatalog).toHaveBeenCalledWith(
    expect.objectContaining({ id: 'sakura', url: 'https://example.com/sakura.json' }),
  )
  // Post-install: the catalog is re-pulled so the row's install_state updates.
  expect(catalogRefresh).toHaveBeenCalledTimes(2)
})
