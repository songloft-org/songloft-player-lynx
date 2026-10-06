import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { createHash, createPublicKey, generateKeyPairSync } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { createBuildMetadata } from '../release-lib.mjs'
import { BUNDLE_ASSET, SIGNATURE_ASSET, createNativeHostMetadata, finalizeRelease,
  loadNativeContract, publicKeyRecord, verifyUpdateSignature } from '../update-release-lib.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const contract = loadNativeContract(root)
// Ephemeral test keys: no private signing material is checked into the repository.
const keys = generateKeyPairSync('rsa', { modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' }, privateKeyEncoding: { type: 'pkcs8', format: 'pem' } })
const metadata = createBuildMetadata({ packageVersion: '0.1.0', sha: 'abcdef0', now: new Date('2026-10-06T00:00:00Z') })

function fixture(t) {
  const base = mkdtempSync(join(tmpdir(), 'lynx-update-contract-'))
  t.after(() => rmSync(base, { recursive: true, force: true }))
  const directory = join(base, 'release')
  const dist = join(base, 'dist')
  mkdirSync(directory); mkdirSync(dist)
  for (const name of ['songloft-lynx-android.apk', 'songloft-lynx-ios-nosign.ipa',
    'songloft-lynx-harmony.hap', 'songloft-lynx-web-standalone.tar.gz', 'songloft-lynx-web-embedded.tar.gz'])
    writeFileSync(join(directory, name), `package ${name}`)
  writeFileSync(join(directory, 'version.json'), JSON.stringify(metadata))
  const bundleSource = join(dist, 'main.lynx.bundle')
  writeFileSync(bundleSource, 'production native bundle')
  return { directory, bundleSource, packageVersion: '0.1.0', contract,
    nativeHost: createNativeHostMetadata(metadata, contract, keys.publicKey),
    publicKey: keys.publicKey, privateKey: keys.privateKey }
}

test('signed native bundle shares one manifest with the five full packages', (t) => {
  const options = fixture(t)
  assert.deepEqual(finalizeRelease(options), { assetCount: 6, signedUpdate: true })
  const raw = readFileSync(join(options.directory, 'version.json'))
  const envelope = JSON.parse(readFileSync(join(options.directory, SIGNATURE_ASSET), 'utf8'))
  const manifest = verifyUpdateSignature(raw, envelope, [publicKeyRecord(keys.publicKey)])
  assert.equal(manifest.channel, 'dev')
  assert.equal(manifest.assets.length, 6)
  assert.equal(manifest.bundle_update.asset, BUNDLE_ASSET)
  assert.deepEqual(manifest.bundle_update.targets.map(t => [t.platform, t.engine]),
    [['android', '4.0.0'], ['ios', '4.0.1'], ['harmony', '4.0.1']])
  assert.ok(manifest.bundle_update.targets.every(t => t.minimum_bridge === 2 && t.maximum_bridge === 2))
  assert.ok(manifest.bundle_update.targets.every(t => t.required_capabilities.includes('updater.metadata.v1')))
  const checksums = readFileSync(join(options.directory, 'checksums.txt'), 'utf8').trim().split('\n')
  assert.equal(checksums.length, 8)
  for (const line of checksums) {
    const [hash, name] = line.split('  ')
    assert.equal(createHash('sha256').update(readFileSync(join(options.directory, name))).digest('hex'), hash)
  }
})

test('byte-level tampering, wrong key, protocol, algorithm and malformed signatures are rejected', (t) => {
  const options = fixture(t); finalizeRelease(options)
  const raw = readFileSync(join(options.directory, 'version.json'))
  const envelope = JSON.parse(readFileSync(join(options.directory, SIGNATURE_ASSET), 'utf8'))
  const trust = [publicKeyRecord(keys.publicKey)]
  for (const bytes of [Buffer.concat([raw, Buffer.from(' ')]), Buffer.from(raw.toString().replace('abcdef0', '0000000'))])
    assert.throws(() => verifyUpdateSignature(bytes, envelope, trust))
  for (const change of [{ protocol: 2 }, { algorithm: 'none' }, { key_id: 'unknown' }, { signature: '*' },
    { signature: Buffer.alloc(256).toString('base64') }])
    assert.throws(() => verifyUpdateSignature(raw, { ...envelope, ...change }, trust))
  assert.throws(() => verifyUpdateSignature(raw, envelope, []))
})

test('SPKI and PKCS#1 records carry the same RSA public key', () => {
  const record = publicKeyRecord(keys.publicKey)
  const spki = createPublicKey({ key: Buffer.from(record.spki_base64, 'base64'), type: 'spki', format: 'der' })
  const pkcs1 = createPublicKey({ key: Buffer.from(record.pkcs1_base64, 'base64'), type: 'pkcs1', format: 'der' })
  assert.deepEqual(spki.export({ type: 'spki', format: 'der' }), pkcs1.export({ type: 'spki', format: 'der' }))
  assert.throws(() => publicKeyRecord(keys.privateKey))
  const weak = generateKeyPairSync('rsa', { modulusLength: 1024 }).publicKey.export({ type: 'spki', format: 'pem' })
  assert.throws(() => publicKeyRecord(weak))
})

test('contract preparation rejects SDK drift and invalid bridge/schema ranges', (t) => {
  const options = fixture(t)
  const project = join(options.directory, 'project')
  for (const folder of ['updates', 'android/app', 'ios', 'harmony/entry'])
    mkdirSync(join(project, folder), { recursive: true })
  writeFileSync(join(project, 'android/app/build.gradle.kts'), 'implementation("org.lynxsdk.lynx:lynx:4.0.0")')
  writeFileSync(join(project, 'ios/Podfile.lock'), '  - Lynx (4.0.1):')
  writeFileSync(join(project, 'harmony/entry/oh-package.json5'), '{"@lynx/lynx":"4.0.1"}')
  const save = (value) => writeFileSync(join(project, 'updates/native-contract.json'), JSON.stringify(value))
  save(contract); assert.deepEqual(loadNativeContract(project), contract)
  for (const value of [{ ...contract, engines: { ...contract.engines, android: '4.0.2' } },
    { ...contract, bridge_version: 0 }, { ...contract, local_schema: -1 },
    { ...contract, minimum_host_version: '0.1.0-rc.1' }]) {
    save(value); assert.throws(() => loadNativeContract(project))
  }
})

test('unconfigured signing emits only full packages and removes stale hot-update assets', (t) => {
  const options = fixture(t); finalizeRelease(options)
  for (const publicKey of ['', keys.publicKey]) {
    assert.deepEqual(finalizeRelease({ ...options, privateKey: '', publicKey }), { assetCount: 5, signedUpdate: false })
    assert.equal(existsSync(join(options.directory, BUNDLE_ASSET)), false)
    assert.equal(existsSync(join(options.directory, SIGNATURE_ASSET)), false)
    assert.equal(JSON.parse(readFileSync(join(options.directory, 'version.json'))).bundle_update, null)
  }
})

test('signed publishing refuses a missing or changed immutable host/key contract', (t) => {
  const options = fixture(t)
  for (const nativeHost of [undefined, { ...options.nativeHost, channel: 'stable' },
    { ...options.nativeHost, engines: { ...options.nativeHost.engines, ios: '4.0.0' } },
    { ...options.nativeHost, trusted_keys: [] }])
    assert.throws(() => finalizeRelease({ ...options, nativeHost }))
  assert.throws(() => finalizeRelease({ ...options, publicKey: '' }))
  const other = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs8', format: 'pem' })
  assert.throws(() => finalizeRelease({ ...options, privateKey: other }))
  assert.equal(existsSync(join(options.directory, BUNDLE_ASSET)), false)
})

test('external assets, oversized bundles, debug evaluators and unexpected release paths fail closed', (t) => {
  const options = fixture(t)
  const extra = join(dirname(options.bundleSource), 'extra.js')
  writeFileSync(extra, 'external'); assert.throws(() => finalizeRelease(options)); rmSync(extra)
  writeFileSync(options.bundleSource, '__E2E_PLAYER_STORE__'); assert.throws(() => finalizeRelease(options))
  writeFileSync(options.bundleSource, Buffer.alloc(32 * 1024 * 1024 + 1)); assert.throws(() => finalizeRelease(options))
  writeFileSync(options.bundleSource, 'production')
  mkdirSync(join(options.directory, 'escape')); assert.throws(() => finalizeRelease(options))
})

test('the checked-in public vector verifies original UTF-8 bytes and detects a changed bundle', () => {
  const vector = JSON.parse(readFileSync(join(root, 'updates/fixtures/signature-v1.json'), 'utf8'))
  const manifest = verifyUpdateSignature(Buffer.from(vector.raw_manifest), vector.envelope, [vector.trusted_key])
  const payload = Buffer.from(vector.bundle_base64, 'base64')
  assert.equal(createHash('sha256').update(payload).digest('hex'), manifest.bundle_update.sha256)
  assert.notEqual(createHash('sha256').update(Buffer.concat([payload, Buffer.from('x')])).digest('hex'), manifest.bundle_update.sha256)
})

test('the same Node-generated signature vector verifies with the Java host algorithm',
  { skip: spawnSync('java', ['-version']).status !== 0 }, (t) => {
  const options = fixture(t); finalizeRelease(options)
  const record = publicKeyRecord(keys.publicKey)
  const envelope = JSON.parse(readFileSync(join(options.directory, SIGNATURE_ASSET), 'utf8'))
  const source = join(options.directory, 'VerifyVector.java')
  writeFileSync(source, `import java.nio.file.*; import java.security.*; import java.security.spec.*; import java.util.*;
class VerifyVector { public static void main(String[] args) throws Exception {
  var key = KeyFactory.getInstance("RSA").generatePublic(new X509EncodedKeySpec(Base64.getDecoder().decode(args[0])));
  var verifier = Signature.getInstance("SHA256withRSA"); verifier.initVerify(key);
  verifier.update(Files.readAllBytes(Path.of(args[1])));
  if (!verifier.verify(Base64.getDecoder().decode(args[2]))) throw new Exception("Invalid signature");
} }`)
  execFileSync('java', [source, record.spki_base64, join(options.directory, 'version.json'), envelope.signature])
  const corrupt = join(options.directory, 'corrupt.json')
  writeFileSync(corrupt, Buffer.concat([readFileSync(join(options.directory, 'version.json')), Buffer.from(' ')]))
  assert.notEqual(spawnSync('java', [source, record.spki_base64, corrupt, envelope.signature]).status, 0)
})
