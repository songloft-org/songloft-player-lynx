import '../../../shims/router-env.js'
import '@testing-library/jest-dom'
import { afterEach, expect, test, vi } from 'vitest'
import { act, fireEvent, getQueriesForElement, render } from '@lynx-js/react/testing-library'

const { getLogLevelSpy, setLogLevelSpy, openURLSpy, exportLogsActionSpy } = vi.hoisted(() => ({
  getLogLevelSpy: vi.fn(async () => 'warn' as const),
  setLogLevelSpy: vi.fn(async () => {}),
  openURLSpy: vi.fn(),
  exportLogsActionSpy: vi.fn(async () => ({ hasBackend: true, hasFrontend: true })),
}))

vi.mock('react-i18next', async () =>
  (await import('../../../__tests__/_render-mocks.js')).mockReactI18next(),
)
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => vi.fn() }))
vi.mock('../../../core/network/token-cache.js', () => ({
  getCachedAccessToken: () => 'test-token',
}))
vi.mock('../../../native/native-platform.js', () => ({
  openURL: openURLSpy,
  isNativePlatformAvailable: () => true,
}))
vi.mock('../api/index.js', () => ({
  getSettingsApi: () => ({ getLogLevel: getLogLevelSpy, setLogLevel: setLogLevelSpy }),
}))
// The export orchestrator is covered by log-export.test.ts; here it is a spy so
// the row's capability-based dispatch (share sheet vs. openURL fallback) is
// observable without zipping anything.
vi.mock('../data/log-export.js', () => ({
  exportAndShareLogs: exportLogsActionSpy,
}))

const { DiagnosticsPage } = await import('../pages/DiagnosticsPage.js')
const { useToastStore, toast } = await import('../../../shared/ui/toast-store.js')

afterEach(() => {
  vi.clearAllMocks()
  toast.clear()
  delete (globalThis as Record<string, unknown>).NativeModules
})

async function renderPage() {
  render(<DiagnosticsPage />)
  await act(async () => { await Promise.resolve() })
  return getQueriesForElement(elementTree.root!)
}

test('renders the four log-level rows under their own heading', async () => {
  const { queryByTestId, queryByText } = await renderPage()

  expect(queryByText('Log level')).toBeInTheDocument()
  for (const id of ['log-level-debug', 'log-level-info', 'log-level-warn', 'log-level-error']) {
    expect(queryByTestId(id), id).toBeInTheDocument()
  }
  expect(queryByTestId('settings-export-logs')).toBeInTheDocument()
})

test('selecting a log level persists it via SettingsApi.setLogLevel', async () => {
  const { queryByTestId } = await renderPage()

  await act(async () => { fireEvent.tap(queryByTestId('log-level-error')!) })

  expect(setLogLevelSpy).toHaveBeenCalledWith('error')
})

test('the export-logs row falls back to openURL when file export is unavailable', async () => {
  // No NativeModules in the unit-test realm → `fileExport` capability is off, so
  // the degraded path applies: open the backend log URL directly (no client logs).
  const { queryByTestId } = await renderPage()

  await act(async () => { fireEvent.tap(queryByTestId('settings-export-logs')!) })

  expect(openURLSpy).toHaveBeenCalledWith(expect.stringContaining('/logs/export'))
  expect(exportLogsActionSpy).not.toHaveBeenCalled()
})

test('the export-logs row uses the zip flow when shareFile is available', async () => {
  ;(globalThis as Record<string, unknown>).NativeModules = {
    SongloftPlatform: { shareFile: () => {} },
  }
  const { queryByTestId } = await renderPage()

  await act(async () => { fireEvent.tap(queryByTestId('settings-export-logs')!) })

  expect(exportLogsActionSpy).toHaveBeenCalledTimes(1)
  expect(openURLSpy).not.toHaveBeenCalled()
})

/**
 * Pins the `{{error}}` interpolation fix. The key used to be written `{error}`
 * (single braces), which i18next emits verbatim — so an export failure showed the
 * literal text "{error}" and the actual reason was lost. With single braces this
 * assertion fails. The message now lands in the global toast store (rendered by
 * `ToastHost`, which is covered separately), so we assert on the stored toast.
 */
test('a failed export reports the reason, not a literal placeholder', async () => {
  ;(globalThis as Record<string, unknown>).NativeModules = {
    SongloftPlatform: { shareFile: () => {} },
  }
  exportLogsActionSpy.mockRejectedValueOnce(new Error('disk full'))
  const { queryByTestId } = await renderPage()

  await act(async () => { fireEvent.tap(queryByTestId('settings-export-logs')!) })
  await act(async () => { await Promise.resolve() })

  const shown = useToastStore.getState().toast
  expect(shown).not.toBeNull()
  expect(shown?.tone).toBe('error')
  expect(shown?.text).toContain('disk full')
  expect(shown?.text).not.toContain('{error}')
})
