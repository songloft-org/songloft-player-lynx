import '../../../shims/router-env.js'
import '@testing-library/jest-dom'
import { beforeEach, expect, test, vi } from 'vitest'
import { act, fireEvent, getQueriesForElement, render } from '@lynx-js/react/testing-library'

import type { ThemeCatalogEntry } from '../api/theme-packs-api.js'

vi.mock('react-i18next', async () =>
  (await import('../../../__tests__/_render-mocks.js')).mockReactI18next(),
)
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
}))

const { activateSpy, applySpy, clearSpy } = vi.hoisted(() => ({
  activateSpy: vi.fn(async () => {}),
  applySpy: vi.fn(async () => {}),
  clearSpy: vi.fn(async () => {}),
}))

// Mirrors the real module: a tiny store the mock below closes over, so a test
// can flip the active pack the way the model would and see the page follow.
const listeners = new Set<() => void>()
let currentPack: { themeId: string } | null = null
function setCurrentPack(pack: { themeId: string } | null): void {
  currentPack = pack
  listeners.forEach(l => l())
}

vi.mock('../../../shared/theme/theme-pack-model.js', () => ({
  activateThemePack: activateSpy,
  applyActiveThemePack: applySpy,
  clearActiveThemePack: clearSpy,
  getActiveThemePack: () => currentPack,
  subscribeActiveThemePack: (listener: () => void) => {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
}))

const catalogRefresh = vi.fn(async (): Promise<ThemeCatalogEntry[]> => [])
const installFromCatalog = vi.fn(async (_entry: ThemeCatalogEntry): Promise<void> => {})

vi.mock('../api/index.js', () => ({
  getThemePacksApi: () => ({
    list: vi.fn(async () => [
      { id: 1, themeId: 'ocean', name: 'Ocean', author: 'Test', description: '', version: '1.0', schemaVersion: 1, createdAt: '', updatedAt: '' },
    ]),
    deletePack: vi.fn(async () => {}),
    refreshCatalog: catalogRefresh,
    installFromCatalog,
  }),
}))

const { ThemePacksPage } = await import('../pages/ThemePacksPage.js')

beforeEach(() => {
  // The spies are module-level (shared across the file), so their call counts
  // and mock implementations must reset between tests.
  vi.clearAllMocks()
  catalogRefresh.mockReset().mockResolvedValue([])
  installFromCatalog.mockReset().mockResolvedValue(undefined)
  activateSpy.mockReset().mockResolvedValue(undefined)
  applySpy.mockReset().mockResolvedValue(undefined)
  clearSpy.mockReset().mockResolvedValue(undefined)
})

async function flush(ms = 10) {
  await act(async () => { await new Promise(r => setTimeout(r, ms)) })
}

function queries() {
  return getQueriesForElement(elementTree.root!)
}

test('renders installed theme packs with active indicator', async () => {
  setCurrentPack({ themeId: 'ocean' })
  render(<ThemePacksPage />)
  await flush()

  const { queryByText } = queries()
  expect(queryByText('Theme Packs')).toBeInTheDocument()
  expect(queryByText('Default')).toBeInTheDocument()
  expect(queryByText('Ocean')).toBeInTheDocument()
  // Refreshing the page re-syncs the server's active pack.
  expect(applySpy).toHaveBeenCalled()
})

test('a failed catalog fetch shows the error and a retry, not "no themes"', async () => {
  setCurrentPack(null)
  catalogRefresh.mockRejectedValueOnce(new Error('GitHub unreachable'))

  render(<ThemePacksPage />)
  await flush()
  await act(async () => { fireEvent.tap(queries().getByText('Catalog')!) })
  await flush()

  const { queryByText } = queries()
  // This is the regression the whole fix exists for: the old code swallowed the
  // error into an empty list and rendered "No themes available.".
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
  setCurrentPack(null)
  catalogRefresh.mockResolvedValueOnce([
    { id: 'sakura', name: 'Sakura', version: '1.0.0', author: 'Songloft', description: '', url: 'https://example.com/sakura.json', sha256: 'abc', installState: 'not_installed' },
    { id: 'neon', name: 'Neon Night', version: '1.0.0', author: 'Songloft', description: '', url: 'https://example.com/neon.json', sha256: 'def', installState: 'installed' },
    { id: 'forest', name: 'Forest', version: '2.0.0', author: 'Songloft', description: '', url: 'https://example.com/forest.json', sha256: 'xyz', installState: 'has_update' },
  ] satisfies ThemeCatalogEntry[])

  render(<ThemePacksPage />)
  await flush()
  await act(async () => { fireEvent.tap(queries().getByText('Catalog')!) })
  await flush()

  const { queryByText } = queries()
  expect(queryByText('Sakura')).toBeInTheDocument()
  expect(queryByText('Neon Night')).toBeInTheDocument()
  expect(queryByText('Forest')).toBeInTheDocument()
  // `installed` is a label; `not_installed`/`has_update` are buttons.
  expect(queryByText('Installed')).toBeInTheDocument()
  expect(queryByText('Update')).toBeInTheDocument()
  expect(queryByText('Install')).toBeInTheDocument()
})

test('installing from the catalog refreshes the list and the catalog', async () => {
  setCurrentPack(null)
  catalogRefresh.mockResolvedValue([
    { id: 'sakura', name: 'Sakura', version: '1.0.0', author: 'Songloft', description: '', url: 'https://example.com/sakura.json', sha256: 'abc', installState: 'not_installed' },
  ] satisfies ThemeCatalogEntry[])

  render(<ThemePacksPage />)
  await flush()
  await act(async () => { fireEvent.tap(queries().getByText('Catalog')!) })
  await flush()

  await act(async () => { fireEvent.tap(queries().getByText('Install')!) })
  await flush()

  expect(installFromCatalog).toHaveBeenCalledWith(
    expect.objectContaining({ id: 'sakura', url: 'https://example.com/sakura.json' }),
  )
  // Post-install: the catalog is re-pulled so the row's install_state updates.
  expect(catalogRefresh).toHaveBeenCalledTimes(2)
})

test('activating a pack goes through the global model, not a local flag', async () => {
  setCurrentPack(null)
  render(<ThemePacksPage />)
  await flush()

  await act(async () => { fireEvent.tap(queries().getByText('Ocean')!) })
  await flush()

  // The model PUTs server-side and notifies the ThemeProvider; a page-local
  // `setActiveId` would tick the row but recolor nothing.
  expect(activateSpy).toHaveBeenCalledWith('ocean')

  // Reset (tap the Default row) clears through the model too.
  await act(async () => { fireEvent.tap(queries().getByText('Default')!) })
  await flush()
  expect(clearSpy).toHaveBeenCalled()
})
