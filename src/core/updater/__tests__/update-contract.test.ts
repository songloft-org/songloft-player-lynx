import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, test } from 'vitest'
import { bundleCompatibility, compareStableVersions, parseReleaseManifest, type NativeHostInfo } from '../update-contract.js'

const vector = JSON.parse(readFileSync(resolve(__dirname, '../../../../updates/fixtures/signature-v1.json'), 'utf8'))
const raw = () => JSON.parse(vector.raw_manifest)
const host: NativeHostInfo = { ...vector.native_host, platform: 'android', engine: '4.0.0',
  trusted_key_ids: [vector.trusted_key.key_id] }

describe('signed-update presentation contract', () => {
  test('consumes the actual public signing vector and accepts matching host contracts on all platforms', () => {
    const manifest = parseReleaseManifest(raw())
    for (const [platform, engine] of [['android', '4.0.0'], ['ios', '4.0.1'], ['harmony', '4.0.1']] as const)
      expect(bundleCompatibility(manifest, { ...host, platform, engine })).toBe('compatible')
    expect(manifest.bundle_update?.size).toBeGreaterThan(0)
  })

  test.each([
    ['protocol', { update_protocol: 2 }], ['channel', { channel: 'stable' }],
    ['engine', { engine: '4.1.0' }], ['host_version', { native_version: '0.0.9' }],
    ['bridge', { bridge_version: 2 }], ['capability', { capabilities: [] }],
    ['schema', { local_schema: 2 }], ['signing_key', { trusted_key_ids: [] }],
  ] as const)('rejects a host mismatch: %s', (reason, changes) => {
    expect(bundleCompatibility(parseReleaseManifest(raw()), { ...host, ...changes })).toBe(reason)
  })

  test('missing platform, preview shell and unsigned legacy manifests require full package updates', () => {
    const missing = raw()
    missing.bundle_update.targets = missing.bundle_update.targets.filter((target: { platform: string }) => target.platform !== 'android')
    expect(bundleCompatibility(parseReleaseManifest(missing), host)).toBe('platform')
    expect(bundleCompatibility(parseReleaseManifest(raw()), { ...host, channel: 'preview' })).toBe('channel')
    expect(bundleCompatibility(parseReleaseManifest({ ...raw(), bundle_update: null }), host)).toBe('unavailable')
  })

  test('rejects unsafe assets, duplicate targets/assets and contradictory sizes/hashes', () => {
    for (const change of [
      (value: ReturnType<typeof raw>) => { value.bundle_update.asset = '../escape' },
      (value: ReturnType<typeof raw>) => { value.bundle_update.bundle_id = 'stale-bundle' },
      (value: ReturnType<typeof raw>) => { value.bundle_update.targets.push(value.bundle_update.targets[0]) },
      (value: ReturnType<typeof raw>) => { value.assets.push(value.assets[0]) },
      (value: ReturnType<typeof raw>) => { value.bundle_update.size++ },
      (value: ReturnType<typeof raw>) => { value.bundle_update.size = 32 * 1024 * 1024 + 1 },
      (value: ReturnType<typeof raw>) => { value.bundle_update.sha256 = '0'.repeat(64) },
      (value: ReturnType<typeof raw>) => { value.bundle_update.targets[0].maximum_bridge = 0 },
      (value: ReturnType<typeof raw>) => { value.bundle_update.targets[0].required_capabilities.push('updater.v1') },
      (value: ReturnType<typeof raw>) => { value.assets[0].size = -1 },
      (value: ReturnType<typeof raw>) => { value.channel = 'stable' },
      (value: ReturnType<typeof raw>) => { value.channel = 'nightly' },
    ]) {
      const value = raw(); change(value)
      expect(() => parseReleaseManifest(value)).toThrow()
    }
    for (const value of [null, [], {}, { ...raw(), assets: null }]) expect(() => parseReleaseManifest(value)).toThrow()
  })

  test('stable versions compare numeric components, including 1.9.0 and 1.10.0', () => {
    expect(compareStableVersions('1.10.0', '1.9.0')).toBe(1)
    expect(compareStableVersions('2.0.0', '1.99.99')).toBe(1)
    expect(compareStableVersions('1.10.0', '1.10.0')).toBe(0)
    expect(compareStableVersions('1.9.0', '1.10.0')).toBe(-1)
    for (const value of ['dev', 'v1.0.0', '1.0.0-rc.1', '01.0.0', '1.0', '1000000000.0.0'])
      expect(compareStableVersions(value, '1.0.0')).toBeNull()
  })
})
