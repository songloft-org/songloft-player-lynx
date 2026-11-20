import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { cp, mkdir, mkdtemp, readlink, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import yaml from 'js-yaml'
import { assertTarget, compatibility } from '../target.mjs'
import { packageConfig } from '../scripts/package-config.mjs'
import { stageMacCefFramework } from '../scripts/stage-cef.mjs'

test('the phase-one target gate accepts exactly the three selected architectures', () => {
  for (const [os, arch] of [
    ['win32', 'x64'],
    ['darwin', 'arm64'],
    ['darwin', 'x64'],
  ]) {
    assert.equal(assertTarget(os, arch), `${os}-${arch}`)
  }
  for (const [os, arch] of [
    ['linux', 'x64'],
    ['win32', 'arm64'],
    ['darwin', 'ia32'],
  ]) {
    assert.throws(
      () => assertTarget(os, arch),
      /Unsupported desktop probe target/,
    )
  }
})

test('candidate framework, CEF, headers and shared compiler pins match the actual manifests', () => {
  const desktop = JSON.parse(
    readFileSync(new URL('../package.json', import.meta.url)),
  )
  const shared = JSON.parse(
    readFileSync(new URL('../../package.json', import.meta.url)),
  )
  assert.equal(
    desktop.dependencies['@lynx-js/lynxtron'],
    compatibility.lynxtron.version,
  )
  assert.equal(
    desktop.dependencies['@lynx-js/cef-webview'],
    compatibility.cef.packageVersion,
  )
  assert.equal(
    desktop.devDependencies['@lynx-js/lynx-library-headers'],
    compatibility.lynxtron.version,
  )
  for (const [name, version] of Object.entries(compatibility.sharedBuild)) {
    assert.equal(
      shared.dependencies[name] ?? shared.devDependencies[name],
      version,
    )
  }
  assert.equal(compatibility.status, 'candidate-unverified')
})

test('the frozen desktop lock includes every selected runtime, including Apple Silicon', () => {
  const lock = yaml.load(
    readFileSync(new URL('../pnpm-lock.yaml', import.meta.url), 'utf8'),
  )
  const runtimeDependencies =
    lock.snapshots[
      `@lynx-js/lynxtron@${lock.importers['.'].dependencies['@lynx-js/lynxtron'].version}`
    ].optionalDependencies
  for (const target of compatibility.targets) {
    const name = `@lynx-js/lynxtron-runtime-${target}-devtool`
    const key = `${name}@${compatibility.lynxtron.version}`
    const entry = lock.packages[key]
    assert.ok(entry, `Missing runtime in frozen lock: ${target}`)
    assert.equal(runtimeDependencies[name], compatibility.lynxtron.version)
    const [os, arch] = target.split('-')
    assert.deepEqual(entry.os, [os])
    assert.deepEqual(entry.cpu, [arch])
    assert.match(entry.resolution.integrity, /^sha512-[A-Za-z0-9+/]+={0,2}$/)
    assert.equal(lock.snapshots[key].optional, true)
  }
})

test('the pinned builder downloader exposes the cache API needed by DMG and NSIS tools', () => {
  const require = createRequire(new URL('../package.json', import.meta.url))
  const builder = createRequire(require.resolve('@lynx-js/lynxtron-builder'))
  const appBuilder = createRequire(
    builder.resolve('app-builder-lib/package.json'),
  )
  assert.equal(
    appBuilder('@electron/get/package.json').version,
    compatibility.builderDownloader,
  )
  assert.equal(
    typeof appBuilder('@electron/get').ElectronDownloadCacheMode.ReadWrite,
    'number',
  )
})

test('the bundle files go in the resource directory expected by each host', () => {
  for (const target of compatibility.targets) {
    const windows = target === 'win32-x64'
    const config = packageConfig({ channel: 'dev', version: '2.13.12', target })
    const files = windows ? config.extraFiles : config.extraResources
    const directory = windows ? 'resources/songloft' : 'songloft'
    assert.deepEqual(
      files?.map((file) => file.to),
      [directory, `${directory}/app`, `${directory}/licenses/CEF.txt`],
      target,
    )
    assert.equal(windows ? config.extraResources : config.extraFiles, undefined)
  }
})

test('desktop channels and variants build without a platform certificate or notarization', () => {
  for (const channel of ['dev', 'stable']) {
    for (const variant of ['standard', 'bundled']) {
      for (const target of compatibility.targets) {
        const config = packageConfig({ channel, variant, version: '2.13.12', target })
        assert.equal(
          config.artifactName,
          `songloft-lynx-${variant}-${channel}-\${os}-\${arch}.\${ext}`,
        )
        assert.equal(config.forceCodeSigning, false)
        if (target.startsWith('darwin-')) {
          assert.equal(config.mac.identity, '-')
          assert.equal(config.mac.notarize, false)
        }
      }
    }
  }
})

test(
  'macOS CEF staging restores framework links flattened by dependency installation',
  { skip: process.platform === 'win32' },
  async (t) => {
    const scratch = await mkdtemp(join(tmpdir(), 'songloft-cef-framework-'))
    t.after(() => rm(scratch, { recursive: true, force: true }))
    const name = 'Chromium Embedded Framework'
    const source = join(scratch, 'source', `${name}.framework`)
    const destination = join(scratch, 'staged', `${name}.framework`)
    const version = join(source, 'Versions', 'A')
    for (const directory of ['Resources', 'Libraries'])
      await mkdir(join(version, directory), { recursive: true })
    await writeFile(join(version, name), 'CEF binary')
    await cp(version, join(source, 'Versions', 'Current'), { recursive: true })
    await writeFile(join(source, name), 'flattened alias')
    await mkdir(join(source, 'Resources'))
    await mkdir(join(source, 'Libraries'))

    await stageMacCefFramework(source, destination)

    assert.equal(await readlink(join(destination, 'Versions', 'Current')), 'A')
    for (const alias of [name, 'Resources', 'Libraries'])
      assert.equal(
        await readlink(join(destination, alias)),
        `Versions/A/${alias}`,
      )
    assert.equal(readFileSync(join(destination, name), 'utf8'), 'CEF binary')
  },
)
