import '../../../shims/router-env.js'
import '@testing-library/jest-dom'
import { afterEach, expect, test, vi } from 'vitest'
import { act, fireEvent, getQueriesForElement, render } from '@lynx-js/react/testing-library'

const { exportSpy, importSpy, invalidateSpy } = vi.hoisted(() => ({
  exportSpy: vi.fn(),
  invalidateSpy: vi.fn(async () => {}),
  importSpy: vi.fn(async () => ({
    playlists_created: 2,
    playlists_merged: 1,
    songs_created: 10,
    songs_matched: 5,
  })),
}))

vi.mock('react-i18next', async () =>
  (await import('../../../__tests__/_render-mocks.js')).mockReactI18next(),
)
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => vi.fn() }))
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: invalidateSpy }) }))

vi.mock('../domain/data-transfer.js', () => ({
  canExport: () => true,
  exportPlaylists: exportSpy,
  importPlaylists: importSpy,
}))

const { DataPage } = await import('../pages/DataPage.js')

/** Turns the `dataTransfer` platform capability on for the current test. */
function withPlatformHost() {
  ;(globalThis as Record<string, unknown>).NativeModules = {
    SongloftPlatform: { openURL: () => {}, pickAndUploadFile: () => {} },
  }
}

afterEach(() => {
  vi.clearAllMocks()
  delete (globalThis as Record<string, unknown>).NativeModules
})

async function renderPage() {
  render(<DataPage />)
  await act(async () => { await Promise.resolve() })
  return getQueriesForElement(elementTree.root!)
}

test('explains itself instead of rendering a blank body when the platform cannot transfer files', async () => {
  // Returning null here (as the old in-list section did) would leave a page with a
  // title bar and nothing under it, which reads as a failed load.
  const { queryByTestId, queryByText } = await renderPage()

  expect(queryByTestId('settings-export')).not.toBeInTheDocument()
  expect(queryByTestId('settings-import')).not.toBeInTheDocument()
  expect(queryByText('Playlist export and import are not available on this platform'))
    .toBeInTheDocument()
})

test('renders both rows on a host with a file picker', async () => {
  withPlatformHost()
  const { queryByTestId } = await renderPage()

  expect(queryByTestId('settings-export')).toBeInTheDocument()
  expect(queryByTestId('settings-import')).toBeInTheDocument()
  expect(queryByTestId('settings-data-unavailable')).not.toBeInTheDocument()
})

test('the export row hands off to exportPlaylists', async () => {
  withPlatformHost()
  const { queryByTestId } = await renderPage()

  await act(async () => { fireEvent.tap(queryByTestId('settings-export')!) })

  expect(exportSpy).toHaveBeenCalledTimes(1)
})

test('the import row reports what was created and merged', async () => {
  withPlatformHost()
  const { queryByTestId, queryByText } = await renderPage()

  await act(async () => { fireEvent.tap(queryByTestId('settings-import')!) })
  await act(async () => { await Promise.resolve() })

  // 2 created / 1 merged / 15 songs, interpolated from the real English copy.
  expect(queryByText(/2/)).toBeInTheDocument()
  expect(importSpy).toHaveBeenCalledTimes(1)
  expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['playlist'] })
  expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['library'] })
})

test('blocks duplicate and opposite-direction taps while the picker is pending, then recovers on cancel', async () => {
  withPlatformHost()
  let cancel!: (error: Error) => void
  importSpy.mockImplementationOnce(() => new Promise((_resolve, reject) => { cancel = reject }))
  const { queryByTestId, queryByText } = await renderPage()
  await act(async () => {
    fireEvent.tap(queryByTestId('settings-import')!)
    fireEvent.tap(queryByTestId('settings-import')!)
    fireEvent.tap(queryByTestId('settings-export')!)
  })
  expect(importSpy).toHaveBeenCalledTimes(1)
  expect(exportSpy).not.toHaveBeenCalled()
  await act(async () => { cancel(new Error('cancelled')) })
  expect(queryByText('Import cancelled')).toBeInTheDocument()
  expect(invalidateSpy).not.toHaveBeenCalled()
  await act(async () => { fireEvent.tap(queryByTestId('settings-export')!) })
  expect(exportSpy).toHaveBeenCalledTimes(1)
})
