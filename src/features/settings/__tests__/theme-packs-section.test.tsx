import '../../../shims/router-env.js'
import '@testing-library/jest-dom'
import { beforeEach, expect, test, vi } from 'vitest'
import { act, fireEvent, getQueriesForElement, render } from '@lynx-js/react/testing-library'

const { activateSpy, applySpy, clearSpy, deletePackSpy, openCatalogSpy } = vi.hoisted(() => ({
  activateSpy: vi.fn(async () => {}),
  applySpy: vi.fn(async () => {}),
  clearSpy: vi.fn(async () => {}),
  deletePackSpy: vi.fn(async () => {}),
  openCatalogSpy: vi.fn(),
}))

vi.mock('react-i18next', async () =>
  (await import('../../../__tests__/_render-mocks.js')).mockReactI18next(),
)

// Mirrors the real module: a tiny store the mock below closes over, so a test
// can flip the active pack the way the model would and see the section follow.
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

vi.mock('../api/index.js', () => ({
  getThemePacksApi: () => ({
    list: vi.fn(async () => [
      { id: 1, themeId: 'ocean', name: 'Ocean', author: 'Test', description: '', version: '1.0', schemaVersion: 1, createdAt: '', updatedAt: '' },
    ]),
    // `deletePack` is a hoisted spy because the factory returns a fresh api
    // object per call — an inline `vi.fn()` here would be a different instance
    // than the one the section captured.
    deletePack: deletePackSpy,
    refreshCatalog: vi.fn(async () => []),
    installFromCatalog: vi.fn(async () => {}),
  }),
}))

const { ThemePacksSection } = await import('../widgets/ThemePacksSection.js')

beforeEach(() => {
  // The spies are module-level (shared across the file), so their call counts
  // and mock implementations must reset between tests.
  vi.clearAllMocks()
  activateSpy.mockReset().mockResolvedValue(undefined)
  applySpy.mockReset().mockResolvedValue(undefined)
  clearSpy.mockReset().mockResolvedValue(undefined)
  deletePackSpy.mockReset().mockResolvedValue(undefined)
})

async function flush(ms = 10) {
  await act(async () => { await new Promise(r => setTimeout(r, ms)) })
}

function queries() {
  return getQueriesForElement(elementTree.root!)
}

test('renders installed theme packs with active indicator', async () => {
  setCurrentPack({ themeId: 'ocean' })
  render(<ThemePacksSection onOpenCatalog={openCatalogSpy} />)
  await flush()

  const { queryByText } = queries()
  expect(queryByText('Theme Packs')).toBeInTheDocument()
  expect(queryByText('Default')).toBeInTheDocument()
  expect(queryByText('Ocean')).toBeInTheDocument()
  // Refreshing the section re-syncs the server's active pack.
  expect(applySpy).toHaveBeenCalled()
})

test('activating a pack goes through the global model, not a local flag', async () => {
  setCurrentPack(null)
  render(<ThemePacksSection onOpenCatalog={openCatalogSpy} />)
  await flush()

  await act(async () => { fireEvent.tap(queries().getByText('Ocean')!) })
  await flush()

  // The model PUTs server-side and notifies the ThemeProvider; a section-local
  // `setActiveId` would tick the row but recolor nothing.
  expect(activateSpy).toHaveBeenCalledWith('ocean')

  // Reset (tap the Default row) clears through the model too.
  await act(async () => { fireEvent.tap(queries().getByText('Default')!) })
  await flush()
  expect(clearSpy).toHaveBeenCalled()
})

test('the store entry row opens the catalog through the injected callback', async () => {
  setCurrentPack(null)
  render(<ThemePacksSection onOpenCatalog={openCatalogSpy} />)
  await flush()

  await act(async () => { fireEvent.tap(queries().getByTestId('theme-packs-catalog-open')!) })
  await flush()
  expect(openCatalogSpy).toHaveBeenCalled()
})

test('deleting is a two-tap flow through the api, and re-syncs the active pack', async () => {
  // Not the active pack — the active row shows a check instead of a delete
  // button, so a delete test has to target an installed-but-inactive pack.
  setCurrentPack(null)
  render(<ThemePacksSection onOpenCatalog={openCatalogSpy} />)
  await flush()

  // First tap arms ("Tap again to delete"), second tap fires the delete.
  await act(async () => { fireEvent.tap(queries().getByText('Delete')!) })
  await flush()
  expect(queries().queryByText('Tap again to delete')).toBeInTheDocument()

  await act(async () => { fireEvent.tap(queries().getByText('Tap again to delete')!) })
  await flush()

  expect(deletePackSpy).toHaveBeenCalledWith('ocean')
  // Deleting the active pack re-syncs the server's "active" fallback.
  expect(applySpy).toHaveBeenCalled()
})
