import '@testing-library/jest-dom'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { act, fireEvent, getQueriesForElement, render } from '@lynx-js/react/testing-library'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ check: vi.fn(), state: vi.fn(), download: vi.fn(), restore: vi.fn(), open: vi.fn(), available: true, web: false }))
vi.mock('react-i18next', async () => (await import('../../../__tests__/_render-mocks.js')).mockReactI18next())
vi.mock('@lynx-js/lynx-ui-switch', async () => (await import('../../../__tests__/_render-mocks.js')).mockLynxUiSwitch())
vi.mock('../api/index.js', () => ({ getSettingsApi: () => ({ getGithubProxy: async () => '' }) }))
vi.mock('../../../native/native-platform.js', () => ({ openURL: mocks.open }))
vi.mock('../../../native/web-platform.js', async original => ({ ...await original<object>(), isWebPlatform: () => mocks.web }))
vi.mock('../../../core/updater/client-updates.js', async original => ({ ...await original<object>(), checkClientUpdate: mocks.check }))
vi.mock('../../../core/updater/native-updater.js', () => ({
  nativeUpdaterAvailable: () => mocks.available, nativeUpdateMetadataAvailable: () => mocks.available,
  getUpdateState: mocks.state, prepareBundleUpdate: mocks.download, restoreBuiltinBundle: mocks.restore,
  confirmUpdateStartup: vi.fn(async () => { }),
  cancelBundleUpdate: vi.fn(), createUpdateTaskId: () => 'update-ui', subscribeUpdateProgress: () => () => { },
}))
import { ClientUpdateSection } from '../widgets/ClientUpdateSection.js'
import { UpdateStartup } from '../../../core/updater/UpdateStartup.js'
import { updateSession } from '../../../core/updater/update-session.js'
import { automaticUpdatePolicy, PREF_AUTOMATIC_UPDATE } from '../../../core/updater/automatic-update-policy.js'
import { createMemoryStorage, setSongloftStorage, getSongloftStorage } from '../../../core/storage/index.js'
import type { ClientUpdateCheck } from '../../../core/updater/client-updates.js'
const vector = JSON.parse(readFileSync(resolve(__dirname, '../../../../updates/fixtures/signature-v1.json'), 'utf8'))
const manifest = JSON.parse(vector.raw_manifest)
const state = () => ({ host: { ...vector.native_host, platform: 'android' }, running: { ...manifest, kind: 'builtin', git_commit: '1111111' }, pending: null, active: null })
const result = (): ClientUpdateCheck => ({
  comparison: 'newer', bundleReason: 'compatible', bundleURL: 'https://example.com/bundle',
  candidate: {
    manifest, rawManifest: vector.raw_manifest, signature: JSON.stringify(vector.envelope), proxy: '',
    release: { id: 1, tag_name: 'dev', updated_at: '2026-10-06T00:00:00Z', published_at: '2026-10-06T00:00:00Z', body: 'Release notes', assets: [] }
  }
})
const settle = async () => { await act(async () => { await new Promise(done => setTimeout(done, 10)) }) }
beforeEach(() => {
  vi.stubGlobal('SystemInfo', { platform: 'Android' }); mocks.state.mockResolvedValue(state()); mocks.check.mockResolvedValue(result())
  setSongloftStorage(createMemoryStorage())
  automaticUpdatePolicy.store.setState({ loaded: true, enabled: false, lastAttempt: 0, nextAttempt: 0, failures: 0, skippedBundles: [], preparedBundle: null })
})
afterEach(async () => {
  await automaticUpdatePolicy.setEnabled(false)
  vi.clearAllMocks(); vi.unstubAllGlobals(); mocks.available = true; mocks.web = false
  updateSession.setState({
    native: null, operation: null, progress: null, error: null, restored: false,
    checking: false, check: null, checkError: null, downloadSource: null
  })
})
test('checks only after a tap, shows shell and bundle separately, and marks pending only after native durable completion', async () => {
  render(<ClientUpdateSection />); await settle()
  const queries = getQueriesForElement(elementTree.root!)
  expect(mocks.check).not.toHaveBeenCalled()
  expect(queries.queryByText('Installed shell')).toBeInTheDocument()
  expect(queries.queryByText('Running bundle')).toBeInTheDocument()
  await act(async () => { fireEvent.tap(queries.queryByTestId('client-update-check')!) }); await settle()
  expect(mocks.check).toHaveBeenCalledExactlyOnceWith({ proxy: '', force: true })
  expect(queries.queryByTestId('client-update-download')).toBeInTheDocument()
  let finish: (id: string) => void = () => { }
  mocks.download.mockImplementation(() => new Promise(done => { finish = done }))
  await act(async () => { fireEvent.tap(queries.queryByTestId('client-update-download')!) })
  await settle()
  expect(mocks.download).toHaveBeenCalledOnce()
  expect(queries.queryByTestId('client-update-pending')).not.toBeInTheDocument()
  mocks.state.mockResolvedValue({ ...state(), pending: manifest })
  await act(async () => { finish(manifest.bundle_update.bundle_id) }); await settle()
  expect(queries.queryByTestId('client-update-pending')).toBeInTheDocument()
})
test('old shells provide only this channel release page and do not run a network check', async () => {
  mocks.available = false
  render(<ClientUpdateSection />); await settle()
  const queries = getQueriesForElement(elementTree.root!)
  await act(async () => { fireEvent.tap(queries.queryByTestId('client-update-check')!) })
  expect(mocks.check).not.toHaveBeenCalled()
  await act(async () => { fireEvent.tap(queries.queryByTestId('client-update-package')!) })
  expect(mocks.open).toHaveBeenCalledExactlyOnceWith('https://github.com/songloft-org/songloft-player-lynx/releases/tag/dev')
})
test('signature rejection has a readable package fallback and cannot download', async () => {
  mocks.check.mockResolvedValue({ ...result(), bundleURL: null, bundleReason: 'signature_invalid' })
  render(<ClientUpdateSection />); await settle()
  const queries = getQueriesForElement(elementTree.root!)
  await act(async () => { fireEvent.tap(queries.queryByTestId('client-update-check')!) }); await settle()
  expect(queries.queryByText(/Bundle signature verification failed/)).toBeInTheDocument()
  expect(queries.queryByTestId('client-update-download')).not.toBeInTheDocument()
  expect(mocks.download).not.toHaveBeenCalled()
})
test('an unknown comparison opens this channel release page instead of suggesting an installation package', async () => {
  const value = result()
  const asset = { name: 'songloft-lynx-android.apk', size: 123, sha256: 'a'.repeat(64) }
  value.candidate = {
    ...value.candidate, manifest: { ...manifest, assets: [asset] },
    release: { ...value.candidate.release, assets: [{ ...asset, id: 2, updated_at: '2026-10-06T00:00:00Z', browser_download_url: 'https://github.com/songloft-org/songloft-player-lynx/releases/download/dev/songloft-lynx-android.apk' }] }
  }
  mocks.check.mockResolvedValue({ ...value, comparison: 'unknown', bundleURL: null })
  render(<ClientUpdateSection />); await settle()
  const queries = getQueriesForElement(elementTree.root!)
  await act(async () => { fireEvent.tap(queries.queryByTestId('client-update-check')!) }); await settle()
  await act(async () => { fireEvent.tap(queries.queryByTestId('client-update-package')!) })
  expect(mocks.open).toHaveBeenCalledExactlyOnceWith('https://github.com/songloft-org/songloft-player-lynx/releases/tag/dev')
})
test('restore requires a second tap, stays on the current root and displays next cold start after success', async () => {
  await automaticUpdatePolicy.setEnabled(true)
  mocks.state.mockResolvedValue({ ...state(), pending: manifest })
  mocks.restore.mockResolvedValue(undefined)
  render(<ClientUpdateSection />); await settle()
  const queries = getQueriesForElement(elementTree.root!)
  await act(async () => { fireEvent.tap(queries.queryByTestId('client-update-restore')!) })
  expect(mocks.restore).not.toHaveBeenCalled()
  mocks.state.mockResolvedValue({ ...state(), last_error: 'restore_builtin' })
  await act(async () => { fireEvent.tap(queries.queryByTestId('client-update-restore')!) }); await settle()
  expect(mocks.restore).toHaveBeenCalledOnce()
  expect(queries.queryByText('The built-in bundle will be restored on the next cold start.')).toBeInTheDocument()
  expect(queries.queryByText(/A previous bundle attempt was rejected/)).not.toBeInTheDocument()
  expect(automaticUpdatePolicy.store.getState().enabled).toBe(false)
})

test('automatic switch is OFF by default and writes the device preference when changed', async () => {
  render(<ClientUpdateSection />); await settle()
  const queries = getQueriesForElement(elementTree.root!)
  const row = queries.getByTestId('client-update-automatic')
  expect(row).toBeInTheDocument()
  expect(queries.queryByText(/May use mobile data/)).toBeInTheDocument()
  expect(automaticUpdatePolicy.store.getState().enabled).toBe(false)
  const toggle = row.querySelector('.app-switch')!
  await act(async () => { fireEvent.tap(toggle) }); await settle()
  expect(automaticUpdatePolicy.store.getState().enabled).toBe(true)
  expect(JSON.parse((await getSongloftStorage().prefs.get(PREF_AUTOMATIC_UPDATE))!).enabled).toBe(true)
})

test('Web shows deployment updates without a native automatic update switch', async () => {
  mocks.web = true
  render(<ClientUpdateSection />); await settle()
  const queries = getQueriesForElement(elementTree.root!)
  expect(queries.queryByTestId('client-update-automatic')).not.toBeInTheDocument()
  expect(queries.queryByTestId('client-update-package')).toBeInTheDocument()
})

test('the actual startup entry downloads an enabled compatible update and About observes native pending state', async () => {
  await automaticUpdatePolicy.setEnabled(true)
  mocks.download.mockImplementation(async () => {
    mocks.state.mockResolvedValue({ ...state(), pending: manifest })
    return manifest.bundle_update.bundle_id
  })
  render(<view><UpdateStartup /><ClientUpdateSection /></view>)
  await settle()
  expect(mocks.check).not.toHaveBeenCalled()
  await act(async () => { await new Promise(done => setTimeout(done, 1700)) })
  expect(mocks.check).toHaveBeenCalledExactlyOnceWith({ proxy: '', force: false })
  expect(mocks.download).toHaveBeenCalledOnce()
  const queries = getQueriesForElement(elementTree.root!)
  expect(queries.queryByTestId('client-update-pending')).toBeInTheDocument()
  expect(updateSession.getState().native?.running.kind).toBe('builtin')
})
