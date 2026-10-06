import assert from 'node:assert/strict'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { createBuildMetadata } from '../release-lib.mjs'
import { createNativeHostMetadata, loadNativeContract } from '../update-release-lib.mjs'
import { writeBundleHost } from '../bundle-host.mjs'

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
test('copy snapshot matches compiled identity and carries only the matching prepared public trust', t => {
  const root = mkdtempSync(join(tmpdir(), 'lynx-bundle-host-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const oldPublic = process.env.SONGLOFT_UPDATE_PUBLIC_KEY
  const oldMetadata = process.env.SONGLOFT_BUILD_METADATA
  delete process.env.SONGLOFT_UPDATE_PUBLIC_KEY; delete process.env.SONGLOFT_BUILD_METADATA
  t.after(() => {
    for (const [name, value] of [['SONGLOFT_UPDATE_PUBLIC_KEY', oldPublic], ['SONGLOFT_BUILD_METADATA', oldMetadata]]) {
      if (value == null) delete process.env[name]; else process.env[name] = value
    }
  })
  for (const path of ['updates/native-contract.json', 'android/app/build.gradle.kts', 'ios/Podfile.lock', 'harmony/entry/oh-package.json5']) {
    mkdirSync(dirname(join(root, path)), { recursive: true }); copyFileSync(join(repo, path), join(root, path))
  }
  const metadata = createBuildMetadata({ packageVersion: '0.1.0', sha: 'abcdef0' })
  writeBundleHost(root, metadata)
  const read = () => JSON.parse(readFileSync(join(root, '.build/bundle-host.json')))
  assert.deepEqual(read(), createNativeHostMetadata(metadata, loadNativeContract(root)))
  const vector = JSON.parse(readFileSync(join(repo, 'updates/fixtures/signature-v1.json')))
  const prepared = { ...read(), trusted_keys: [vector.trusted_key] }
  writeFileSync(join(root, '.build/native-host.json'), JSON.stringify(prepared))
  writeBundleHost(root, metadata)
  assert.deepEqual(read(), prepared)
  // Local unprepared builds do not inherit a key from a stale shell snapshot.
  writeBundleHost(root, { ...metadata, git_commit: 'fedcba0' })
  assert.deepEqual(read().trusted_keys, [])
  // Explicit prepared release builds fail rather than silently dropping/changing trust.
  process.env.SONGLOFT_BUILD_METADATA = 'prepared'
  assert.throws(() => writeBundleHost(root, { ...metadata, git_commit: 'fedcba0' }))
})
