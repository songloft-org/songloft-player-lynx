import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
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

test('downloaded CI artifacts are sufficient to copy the compiled host into all three native shells', t => {
  const root = mkdtempSync(join(tmpdir(), 'lynx-copy-artifacts-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  for (const path of ['scripts/assert-bundle-fresh.mjs', 'scripts/copy-bundle-android.mjs', 'scripts/copy-bundle-ios.mjs', 'scripts/copy-bundle-harmony.mjs', 'web/app_icon.png']) {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    copyFileSync(join(repo, path), join(root, path))
  }
  const metadata = createBuildMetadata({ packageVersion: '0.1.0', sha: 'abcdef0' })
  const host = createNativeHostMetadata(metadata, loadNativeContract(repo))
  const generated = new Map([
    ['dist/main.lynx.bundle', Buffer.from('production bundle')],
    ['.build/version.json', Buffer.from(JSON.stringify(metadata))],
    ['.build/native-host.json', Buffer.from(JSON.stringify(host))],
    ['.build/bundle-host.json', Buffer.from(JSON.stringify(host))],
  ])
  const workflow = readFileSync(join(repo, '.github/workflows/build-and-release.yml'), 'utf8')
  const artifact = workflow.match(/name: js-bundles\s+path: \|\n([\s\S]*?)\s+include-hidden-files: true/)?.[1]
  assert.ok(artifact, 'Shared artifact declaration is required')
  // Reproduce a clean native job: only paths actually uploaded by the JS job exist.
  const paths = artifact.trim().split('\n').map(path => path.trim())
  for (const [path, data] of generated) {
    if (paths.some(prefix => path === prefix || path.startsWith(prefix.replace(/\/$/, '') + '/'))) {
      mkdirSync(dirname(join(root, path)), { recursive: true })
      writeFileSync(join(root, path), data)
    }
  }
  for (const [platform, destination] of [
    ['android', 'android/app/src/main/assets/native-host.json'],
    ['ios', 'ios/SongloftLynx/native-host.json'],
    ['harmony', 'harmony/entry/src/main/resources/rawfile/native-host.json'],
  ]) {
    execFileSync(process.execPath, [join(root, `scripts/copy-bundle-${platform}.mjs`)], { stdio: 'pipe' })
    assert.deepEqual(JSON.parse(readFileSync(join(root, destination))), host)
  }
})
