import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ state: vi.fn(), inspect: vi.fn(), resolve: vi.fn(), metadata: true, native: true, web: false }))
vi.mock('../native-updater.js', () => ({ getUpdateState: mocks.state, inspectUpdateManifest: mocks.inspect,
  nativeUpdaterAvailable: () => mocks.native, nativeUpdateMetadataAvailable: () => mocks.metadata }))
vi.mock('../update-metadata.js', () => ({ clientReleaseResolver: { resolve: mocks.resolve } }))
vi.mock('../../../native/web-platform.js', () => ({ isWebPlatform: () => mocks.web }))
import { checkClientUpdate } from '../client-updates.js'
import { RELEASE_REPOSITORY } from '../release-resolver.js'

const vector = JSON.parse(readFileSync(resolve(__dirname, '../../../../updates/fixtures/signature-v1.json'), 'utf8'))
const manifest = JSON.parse(vector.raw_manifest)
function candidate() {
  const asset = manifest.assets[0]
  return { manifest: structuredClone(manifest), rawManifest: vector.raw_manifest, signature: JSON.stringify(vector.envelope), proxy: '',
    release: { assets: [{ ...asset, browser_download_url: `${RELEASE_REPOSITORY}/releases/download/dev/${asset.name}` }] } }
}
function state() { return { host: { ...vector.native_host, platform: 'android', engine: '4.0.0', trusted_key_ids: [vector.trusted_key.key_id] },
  running: { ...manifest, git_commit: '1111111' } } }
beforeEach(() => { mocks.state.mockResolvedValue(state()); mocks.resolve.mockResolvedValue(candidate()); mocks.inspect.mockResolvedValue(manifest) })
afterEach(() => { vi.resetAllMocks(); mocks.metadata = true; mocks.native = true; mocks.web = false })
test('dev resolves its immutable shell channel and offers a bundle only after the native raw signature inspection', async () => {
  const result = await checkClientUpdate({ proxy: 'https://proxy.example' })
  expect(result.comparison).toBe('newer')
  expect(result.bundleURL).toContain('https://proxy.example/https://github.com/')
  expect(mocks.resolve).toHaveBeenCalledExactlyOnceWith({ channel: 'dev', proxy: 'https://proxy.example', force: false })
  expect(mocks.inspect).toHaveBeenCalledWith(vector.raw_manifest, JSON.stringify(vector.envelope))
})
test('bad signature retries dev once and offers only installation packages without approving a bundle', async () => {
  mocks.inspect.mockRejectedValue(new Error('invalid_signature'))
  const result = await checkClientUpdate({ proxy: '' })
  expect(result).toMatchObject({ bundleURL: null, bundleReason: 'signature_invalid' })
  expect(mocks.resolve.mock.calls.map(([request]) => request)).toEqual([{ channel: 'dev', proxy: '', force: false }, { channel: 'dev', proxy: '', force: true }])
})
test('unknown comparison and incompatible bridge never reach native inspection', async () => {
  const data = state(); data.running.git_commit = 'unknown'; data.running.build_time = 'unknown'
  mocks.state.mockResolvedValue(data)
  expect((await checkClientUpdate({ proxy: '' })).comparison).toBe('unknown')
  data.running.git_commit = '1111111'; data.host.bridge_version = 99
  expect(await checkClientUpdate({ proxy: '' })).toMatchObject({ bundleURL: null, bundleReason: 'bridge' })
  expect(mocks.inspect).not.toHaveBeenCalled()
})
test('stable uses latest only, never retries on a signature failure and never selects dev', async () => {
  const data = state(); data.host.channel = 'stable'; data.running.channel = 'stable'; data.running.version = '1.9.0'
  mocks.state.mockResolvedValue(data)
  const remote = candidate(); remote.manifest.channel = 'stable'; remote.manifest.version = '1.10.0'
  mocks.resolve.mockResolvedValue(remote); mocks.inspect.mockRejectedValue(new Error('invalid_signature'))
  expect(await checkClientUpdate({ proxy: '' })).toMatchObject({ comparison: 'newer', bundleURL: null, bundleReason: 'signature_invalid' })
  expect(mocks.resolve).toHaveBeenCalledExactlyOnceWith({ channel: 'stable', proxy: '', force: false })
})
test('a shell without remote plugin templates offers a full package in its own channel', async () => {
  const remote = candidate()
  for (const target of remote.manifest.bundle_update.targets)
    target.required_capabilities.push('pluginFrame.templates.v1')
  mocks.resolve.mockResolvedValue(remote)
  const result = await checkClientUpdate({ proxy: '' })
  expect(result).toMatchObject({ comparison: 'newer', bundleURL: null, bundleReason: 'capability' })
  expect(mocks.resolve).toHaveBeenCalledExactlyOnceWith({ channel: 'dev', proxy: '', force: false })
  expect(mocks.inspect).not.toHaveBeenCalled()
})
test('an older shell cannot use business fetch as a fallback; Web always offers its deployment package', async () => {
  mocks.metadata = false
  await expect(checkClientUpdate({ proxy: '' })).rejects.toThrow('metadata_unavailable')
  expect(mocks.resolve).not.toHaveBeenCalled()
  mocks.web = true
  expect((await checkClientUpdate({ proxy: '' })).bundleURL).toBeNull()
  expect(mocks.inspect).not.toHaveBeenCalled()
})
