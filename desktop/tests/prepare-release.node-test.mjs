import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createPublicKey, generateKeyPairSync } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  compatibility,
  desktopReleaseAsset,
  desktopUpdateManifestUrl,
} from '../target.mjs'
import { verifyManifest } from '../host/update-manifest.mjs'

const prepare = fileURLToPath(
  new URL('../scripts/prepare-release.mjs', import.meta.url),
)
const configureSigning = fileURLToPath(
  new URL('../scripts/ci-signing.mjs', import.meta.url),
)

test('desktop manifest discovery follows the shared dev and latest stable Releases', () => {
  const base = 'https://github.com/songloft-org/songloft/releases'
  assert.equal(
    desktopUpdateManifestUrl('dev', 'win32-x64'),
    `${base}/download/dev/desktop-bundled-win32-x64.json`,
  )
  assert.equal(
    desktopUpdateManifestUrl('stable', 'darwin-x64'),
    `${base}/latest/download/desktop-bundled-darwin-x64.json`,
  )
  assert.throws(() => desktopUpdateManifestUrl('preview', 'win32-x64'))
  assert.throws(() => desktopReleaseAsset('desktop-stable', 'installer.exe'))
  assert.throws(() => desktopReleaseAsset('v2.1.0-beta.1', 'installer.exe'))
})

test('rolling desktop releases keep one fixed installer name per target', () => {
  const workflow = readFileSync(
    new URL('../../.github/workflows/build-and-release.yml', import.meta.url),
    'utf8',
  )
  for (const name of [
    'songloft-lynx-standard-win32-x64.exe',
    'songloft-lynx-standard-darwin-arm64.zip',
    'songloft-lynx-standard-darwin-x64.zip',
    'songloft-lynx-standard-darwin-arm64.dmg',
    'songloft-lynx-standard-darwin-x64.dmg',
  ])
    assert.ok(workflow.includes(name), `Missing fixed desktop asset ${name}`)
  assert.doesNotMatch(workflow, /songloft-lynx-dev-\*-win32-x64-\*\.exe/)
})

test('desktop distribution requires the configured Ed25519 update key', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'songloft-desktop-signing-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const settings = join(root, 'github-env')
  const keyPath = join(root, 'desktop-update-public.pem')
  const configure = (channel, publish, publicKey = '') =>
    spawnSync(process.execPath, [configureSigning], {
      encoding: 'utf8',
      env: {
        ...process.env,
        SONGLOFT_DESKTOP_CHANNEL: channel,
        REQUIRE_UPDATE_KEY: String(publish),
        UPDATE_PUBLIC_KEY: publicKey,
        RUNNER_TEMP: root,
        GITHUB_ENV: settings,
      },
    })

  for (const [channel, publish] of [
    ['stable', false],
    ['dev', true],
  ]) {
    const missing = configure(channel, publish)
    assert.notEqual(missing.status, 0)
    assert.match(missing.stderr, /Configure DESKTOP_UPDATE_PUBLIC_KEY/)
    assert.equal(existsSync(keyPath), false)
  }
  const otherKey = generateKeyPairSync('ed448').publicKey.export({
    type: 'spki',
    format: 'pem',
  })
  const unsupported = configure('dev', true, otherKey)
  assert.notEqual(unsupported.status, 0)
  assert.match(unsupported.stderr, /must be Ed25519/)
  assert.equal(existsSync(keyPath), false)

  const testBuild = configure('dev', false)
  assert.equal(testBuild.status, 0, testBuild.stderr)
  assert.equal(
    createPublicKey(readFileSync(keyPath)).asymmetricKeyType,
    'ed25519',
  )

  const publicKey = generateKeyPairSync('ed25519').publicKey
  const stable = configure(
    'stable',
    true,
    publicKey.export({ type: 'spki', format: 'pem' }),
  )
  assert.equal(stable.status, 0, stable.stderr)
  assert.ok(publicKey.equals(createPublicKey(readFileSync(keyPath))))
  assert.ok(readFileSync(settings, 'utf8').includes(`=${keyPath}\n`))
})

test('desktop release stages all installers and signs their matching update assets', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'songloft-desktop-release-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const { privateKey, publicKey } = generateKeyPairSync('ed25519')
  const privatePath = join(root, 'private.pem')
  writeFileSync(
    privatePath,
    privateKey.export({ type: 'pkcs8', format: 'pem' }),
  )
  const trust = publicKey.export({ type: 'spki', format: 'pem' })
  const clientSha = 'a'.repeat(40)
  const clientSourceSha256 = 'c'.repeat(64)
  const backendSha = 'b'.repeat(40)
  const bundleSha256 = 'e'.repeat(64)
  const channel = 'stable'
  const artifacts = join(root, 'artifacts')
  const first = join(root, 'first')
  const next = join(root, 'next')
  function writeInput(
    version,
    buildChannel = channel,
    builtAt = new Date().toISOString(),
  ) {
    for (const variant of ['standard', 'bundled']) for (const target of compatibility.targets) {
      const artifact = join(artifacts, `desktop-${buildChannel}-${variant}-${target}`)
      const metadata = join(artifact, 'resources', target)
      const release = join(artifact, 'release', buildChannel, target)
      mkdirSync(metadata, { recursive: true })
      mkdirSync(release, { recursive: true })
      writeFileSync(
        join(release, target.startsWith('darwin') ? 'App.zip' : 'App.exe'),
        target,
      )
      if (target.startsWith('darwin'))
        writeFileSync(join(release, 'App.dmg'), target)
      writeFileSync(
        join(metadata, 'build-info.json'),
        JSON.stringify({
          schema: 1,
          target,
          channel: buildChannel,
          variant,
          clientSha,
          clientSourceSha256,
          bundleSha256,
          backendSha,
          backendPinnedSha: backendSha,
          backendVersion: '2.0.0',
          version,
          dirty: false,
          builtAt,
          updatePublicKey: trust,
          updateManifest: desktopUpdateManifestUrl(buildChannel, target, variant),
        }),
      )
    }
  }
  const stage = (out, previous, buildChannel = channel, tag = 'v2.1.0', inline = false) =>
    spawnSync(
      process.execPath,
      [
        prepare,
        buildChannel,
        buildChannel === 'dev' ? 'dev' : tag,
        clientSha,
        backendSha,
        artifacts,
        out,
        ...(previous ? [previous] : []),
      ],
      {
        encoding: 'utf8',
        env: {
          ...process.env,
          SONGLOFT_DESKTOP_UPDATE_PRIVATE_KEY: inline ? '' : privatePath,
          SONGLOFT_DESKTOP_UPDATE_PRIVATE_KEY_PEM: inline
            ? privateKey.export({ type: 'pkcs8', format: 'pem' })
            : '',
        },
      },
    )

  writeInput('2.1.0')
  const staged = stage(first, undefined, channel, 'v2.1.0', true)
  assert.equal(staged.status, 0, staged.stderr)
  assert.equal(readdirSync(join(first, 'assets')).length, 10)
  for (const variant of ['standard', 'bundled']) for (const target of compatibility.targets) {
    const [os, arch] = target.split('-')
    const manifest = verifyManifest(
      JSON.parse(
        readFileSync(join(first, 'manifests', `desktop-${variant}-${target}.json`)),
      ),
      { publicKey: trust, channel, os, arch, variant, currentVersion: '2.0.0' },
    )
    const name = new URL(manifest.asset.url).pathname.split('/').at(-1)
    const expectedPackage = target.startsWith('darwin')
      ? `songloft-lynx-${variant}-${target}.zip`
      : `songloft-lynx-${variant}-${target}.exe`
    assert.equal(
      manifest.asset.url,
      `https://github.com/${variant === 'bundled' ? 'songloft-org/songloft' : 'songloft-org/songloft-player-lynx'}/releases/download/v2.1.0/${expectedPackage}`,
    )
    assert.equal(name, expectedPackage)
    assert.equal(readFileSync(join(first, 'assets', name), 'utf8'), target)
    assert.equal(manifest.available, true)
  }
  const macMetadata = join(
    artifacts,
    'desktop-stable-bundled-darwin-x64',
    'resources',
    'darwin-x64',
    'build-info.json',
  )
  const differentBackend = JSON.parse(readFileSync(macMetadata, 'utf8'))
  differentBackend.backendVersion = '2.0.1'
  writeFileSync(macMetadata, JSON.stringify(differentBackend))
  const mismatch = stage(join(root, 'version-mismatch'))
  assert.notEqual(mismatch.status, 0)
  assert.match(mismatch.stderr, /backend identity/)

  writeInput('2.1.0')
  const differentSource = JSON.parse(readFileSync(macMetadata, 'utf8'))
  differentSource.clientSourceSha256 = 'd'.repeat(64)
  writeFileSync(macMetadata, JSON.stringify(differentSource))
  const mixedSourceOutput = join(root, 'source-mismatch')
  const mixedSources = stage(mixedSourceOutput)
  assert.notEqual(mixedSources.status, 0)
  assert.match(mixedSources.stderr, /same client source/)
  assert.equal(existsSync(mixedSourceOutput), false)

  writeInput('2.1.0')
  const differentBundle = JSON.parse(readFileSync(macMetadata, 'utf8'))
  differentBundle.bundleSha256 = 'f'.repeat(64)
  writeFileSync(macMetadata, JSON.stringify(differentBundle))
  const mixedBundle = stage(join(root, 'bundle-mismatch'))
  assert.notEqual(mixedBundle.status, 0)
  assert.match(mixedBundle.stderr, /same client source, bundle/)

  writeInput('2.1.0')
  const wrongBackend = JSON.parse(readFileSync(macMetadata, 'utf8'))
  wrongBackend.backendSha = wrongBackend.backendPinnedSha = 'f'.repeat(40)
  writeFileSync(macMetadata, JSON.stringify(wrongBackend))
  const otherCheckout = stage(join(root, 'unexpected-backend'))
  assert.notEqual(otherCheckout.status, 0)
  assert.match(otherCheckout.stderr, /Build metadata rejected/)

  writeInput('2.1.0')
  const wrongTag = stage(join(root, 'wrong-tag'), undefined, channel, 'v2.1.1')
  assert.notEqual(wrongTag.status, 0)
  assert.match(wrongTag.stderr, /Build metadata rejected/)

  writeInput('2.0.0')
  const downgrade = stage(next, join(first, 'manifests'), channel, 'v2.0.0')
  assert.notEqual(downgrade.status, 0)
  assert.match(downgrade.stderr, /Refusing to replace a newer or unchanged/)

  const devFirst = join(root, 'dev-first')
  writeInput('2.1.0', 'dev', '2026-01-01T00:00:00Z')
  const devStaged = stage(devFirst, undefined, 'dev')
  assert.equal(devStaged.status, 0, devStaged.stderr)
  const devManifest = JSON.parse(
    readFileSync(join(devFirst, 'manifests', 'desktop-bundled-win32-x64.json')),
  )
  const dev = verifyManifest(devManifest, {
    publicKey: trust,
    channel: 'dev',
    os: 'win32',
    arch: 'x64',
    currentVersion: '2.0.0',
  })
  assert.equal(
    dev.asset.url,
    'https://github.com/songloft-org/songloft/releases/download/dev/songloft-lynx-bundled-win32-x64.exe',
  )
  writeInput('2.0.0', 'dev', '2026-01-01T00:00:01Z')
  const devDowngrade = stage(
    join(root, 'dev-next'),
    join(devFirst, 'manifests'),
    'dev',
  )
  assert.notEqual(devDowngrade.status, 0)
  assert.match(devDowngrade.stderr, /Refusing to replace a newer or unchanged/)
})
