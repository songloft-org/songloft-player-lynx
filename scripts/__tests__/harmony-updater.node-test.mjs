import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash, createPublicKey, verify } from 'node:crypto'
import * as fs from 'node:fs'
import https from 'node:https'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
import test from 'node:test'
import ts from 'typescript'

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const vector = JSON.parse(fs.readFileSync(join(repo, 'updates/fixtures/signature-v1.json'), 'utf8'))
const payload = Buffer.from(vector.bundle_base64, 'base64')
const prefix = 'harmony/entry/src/main/ets/modules/updater/'

// Execute actual ArkTS core source with file/crypto/RCP adapters. This does NOT compile ArkTS or emulate HarmonyOS.
function native(t, options = {}) {
  const root = fs.mkdtempSync(join(tmpdir(), 'lynx-harmony-update-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const host = structuredClone(vector.native_host)
  host.git_commit = '1111111'
  const metadata = () => Buffer.from(JSON.stringify(host))
  const util = {
    TextEncoder: class { encodeInto(text) { return new TextEncoder().encode(text) } },
    TextDecoder: { create: () => ({ decodeToString: data => new TextDecoder().decode(data) }) },
    Base64Helper: class {
      decodeSync(data) { return new Uint8Array(Buffer.from(data, 'base64')) }
      encodeToStringSync(data) { return Buffer.from(data).toString('base64') }
    },
  }
  const cryptoFramework = {
    createMd: algorithm => {
      assert.equal(algorithm, 'SHA256')
      const hash = createHash('sha256')
      return { updateSync: blob => hash.update(blob.data), digestSync: () => ({ data: new Uint8Array(hash.digest()) }) }
    },
    createAsyKeyGenerator: algorithm => ({ convertKeySync: blob => {
      const pubKey = createPublicKey({ key: Buffer.from(blob.data), type: 'spki', format: 'der' })
      assert.equal(algorithm, 'RSA' + pubKey.asymmetricKeyDetails.modulusLength)
      return { pubKey }
    } }),
    createVerify: algorithm => {
      let publicKey
      return { initSync: key => { publicKey = key }, verifySync: (data, signature) => {
        assert.equal(algorithm, 'RSA' + publicKey.asymmetricKeyDetails.modulusLength + '|PKCS1|SHA256')
        return verify('RSA-SHA256', data.data, publicKey, signature.data)
      } }
    },
  }
  const fileIo = {
    OpenMode: { CREATE: fs.constants.O_CREAT, READ_ONLY: fs.constants.O_RDONLY, WRITE_ONLY: fs.constants.O_WRONLY, TRUNC: fs.constants.O_TRUNC },
    mkdirSync: (path, recursive = false) => fs.mkdirSync(path, { recursive }),
    accessSync: path => fs.existsSync(path),
    openSync: (path, mode) => ({ fd: fs.openSync(path, mode, 0o600) }),
    closeSync: fs.closeSync, fsyncSync: fs.fsyncSync, statSync: fs.statSync, readTextSync: path => fs.readFileSync(path, 'utf8'),
    readSync: (fd, data, params) => fs.readSync(fd, new Uint8Array(data), 0, data.byteLength, params?.offset ?? null),
    writeSync: (fd, data) => fs.writeSync(fd, new Uint8Array(data)),
    renameSync: fs.renameSync, unlinkSync: fs.unlinkSync, listFileSync: fs.readdirSync,
    rmdirSync: path => fs.rmSync(path, { recursive: true, force: true }),
  }
  let clock = 1000
  const globals = { util, cryptoFramework, fileIo, ArrayBuffer, Uint8Array,
    url: { URL: class extends URL { static parseURL(value) { return new URL(value) } } },
    systemDateTime: { TimeType: { STARTUP: 0 }, getUptime: () => clock },
    statfs: { getFreeSizeSync: path => options.free ?? fs.statfsSync(path).bavail * fs.statfsSync(path).bsize },
    setTimeout: (...args) => setTimeout(...args).unref(), clearTimeout,
    rcp: { Request: class { constructor(url, method) { this.url = url; this.method = method } },
      createSession: () => {
        const active = new Map()
        return {
          fetch: request => new Promise((done, fail) => {
            assert.equal(request.configuration.transfer.autoRedirect, false)
            assert.equal(request.configuration.security.remoteValidation, 'system')
            const connection = https.get(request.url, { ca: options.ca, rejectUnauthorized: true }, response => {
              response.on('data', chunk => request.configuration.tracing.httpEventsHandler.onDataReceive(chunk.buffer.slice(chunk.byteOffset, chunk.byteOffset + chunk.length)))
              response.on('end', () => done({ statusCode: response.statusCode, headers: response.headers }))
              response.on('error', fail)
            })
            active.set(request, connection)
            connection.on('error', fail)
          }),
          cancel: request => active.get(request)?.destroy(new Error('cancelled')),
          close: () => { for (const connection of active.values()) connection.destroy() },
        }
      },
    },
  }
  const load = name => {
    const source = fs.readFileSync(join(repo, prefix + name + '.ets'), 'utf8').replace(/^import .*$/gm, '')
    const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText
    const exports = {}
    runInNewContext(js, { ...globals, exports })
    Object.assign(globals, exports)
    return exports
  }
  load('BundleUpdateProtocol'); load('BundleUpdateTransfer')
  const Store = load('BundleUpdateStore').BundleUpdateStore
  const context = { filesDir: root, resourceManager: { getRawFileContentSync: metadata } }
  const make = () => new Store(context)
  const request = (url, task_id = 'test-1') => ({ task_id, manifest: vector.raw_manifest, signature: JSON.stringify(vector.envelope), url })
  return { make, host, root, request, clock: value => { clock = value }, protocol: globals.BundleUpdateProtocol }
}

async function endpoint(t) {
  const root = fs.mkdtempSync(join(tmpdir(), 'lynx-harmony-tls-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=localhost',
    '-addext', 'subjectAltName=IP:127.0.0.1,DNS:localhost', '-keyout', join(root, 'key.pem'), '-out', join(root, 'cert.pem')], { stdio: 'ignore' })
  const ca = fs.readFileSync(join(root, 'cert.pem'))
  const server = https.createServer({ cert: ca, key: fs.readFileSync(join(root, 'key.pem')) }, (request, response) => {
    if (request.url === '/redirect') { response.writeHead(302, { location: '/bundle' }); response.end(); return }
    if (request.url === '/downgrade') { response.writeHead(302, { location: 'http://127.0.0.1/bundle' }); response.end(); return }
    if (request.url === '/slow') {
      response.writeHead(200); response.write(payload.subarray(0, 3))
      const timer = setTimeout(() => response.end(payload.subarray(3)), 1000)
      response.on('close', () => clearTimeout(timer)); return
    }
    response.writeHead(200)
    response.end(request.url === '/tampered' ? Buffer.alloc(payload.length) : payload)
  })
  await new Promise(done => server.listen(0, '127.0.0.1', done))
  t.after(() => new Promise(done => { server.closeAllConnections(); server.close(done) }))
  return { ca, url: `https://127.0.0.1:${server.address().port}` }
}

test('HarmonyOS core verifies the shared raw UTF-8 vector and rejects tampering/unknown keys/compatibility', t => {
  const env = native(t)
  const store = env.make()
  assert.equal(store.inspect(vector.raw_manifest, JSON.stringify(vector.envelope)).bundle_update.bundle_id, vector.native_host.channel + '-' + vector.native_host.build_number + '-' + vector.native_host.git_commit)
  assert.throws(() => store.inspect(vector.raw_manifest + ' ', JSON.stringify(vector.envelope)), /invalid_signature/)
  for (const [change, code] of [
    [host => { host.trusted_keys = [] }, 'unknown_signing_key'],
    [host => { host.channel = 'stable' }, 'incompatible_channel'],
    [host => { host.engines.harmony = '9.0.0' }, 'incompatible_engine'],
    [host => { host.bridge_version = 99 }, 'incompatible_bridge'],
    [host => { host.local_schema = 99 }, 'incompatible_schema'],
    [host => { host.capabilities = [] }, 'incompatible_capability'],
  ]) {
    const saved = structuredClone(env.host)
    change(env.host)
    assert.throws(() => env.make().inspect(vector.raw_manifest, JSON.stringify(vector.envelope)), new RegExp(code))
    Object.assign(env.host, saved)
  }
})

test('HarmonyOS signed streaming download activates only on cold start, confirms, restores and rejects disk tampering', async t => {
  const server = await endpoint(t), env = native(t, { ca: server.ca }), store = env.make()
  assert.equal(store.beginLaunch(), undefined)
  const result = await store.prepare(env.request(server.url + '/redirect'), () => {})
  assert.equal(result.prepared, true)
  assert.equal(store.info().running.kind, 'builtin')
  const trial = env.make()
  assert.deepEqual(Buffer.from(trial.beginLaunch()), payload)
  trial.confirmStartup('wrong-id')
  assert.equal(trial.info().running.kind, 'trial')
  trial.confirmStartup(result.bundle_id)
  const active = env.make()
  assert.deepEqual(Buffer.from(active.beginLaunch()), payload)
  assert.equal(active.info().running.kind, 'active')
  active.restoreBuiltin()
  assert.deepEqual(Buffer.from(active.beginLaunch()), payload)
  assert.equal(env.make().beginLaunch(), undefined)
  await store.prepare(env.request(server.url + '/bundle', 'test-2'), () => {})
  const key = env.protocol.key(JSON.parse(vector.raw_manifest))
  fs.writeFileSync(join(env.root, 'bundle_updates/bundles', key, 'main.lynx.bundle'), Buffer.alloc(payload.length))
  assert.equal(env.make().beginLaunch(), undefined)
})

test('HarmonyOS unconfirmed trial rolls back, late confirmation fails, and a new shell filters older bundles', async t => {
  const server = await endpoint(t), env = native(t, { ca: server.ca }), store = env.make()
  store.beginLaunch()
  const result = await store.prepare(env.request(server.url + '/bundle'), () => {})
  const trial = env.make(); trial.beginLaunch()
  env.clock(121001); trial.confirmStartup(result.bundle_id)
  assert.equal(trial.info().running.kind, 'trial')
  const rollback = env.make()
  assert.equal(rollback.beginLaunch(), undefined)
  assert.equal(rollback.info().last_error, 'rollback_unconfirmed')
  await store.prepare(env.request(server.url + '/bundle', 'test-2'), () => {})
  env.host.build_time = new Date(Date.parse(env.host.build_time) + 1000).toISOString()
  assert.equal(env.make().beginLaunch(), undefined)
})

test('HarmonyOS TLS failures, downgrade redirects, cancelled transfer and corrupt payload never create pending', async t => {
  const server = await endpoint(t)
  const strict = native(t), strictStore = strict.make()
  strictStore.beginLaunch()
  await assert.rejects(strictStore.prepare(strict.request(server.url + '/bundle'), () => {}), /download_failed/)
  const env = native(t, { ca: server.ca }), store = env.make()
  store.beginLaunch()
  for (const path of ['/downgrade', '/tampered']) {
    await assert.rejects(store.prepare(env.request(server.url + path), () => {}), /invalid_update_url|checksum_mismatch/)
    assert.equal(store.info().pending, null)
  }
  await assert.rejects(store.prepare(env.request(server.url + '/slow'), event => {
    if (event.bytes > 0) store.cancel(event.task_id)
  }), /cancelled/)
  store.cancel('queued-task')
  await assert.rejects(store.prepare(env.request(server.url + '/bundle', 'queued-task'), () => {}), /cancelled/)
  await assert.rejects(store.prepare(env.request(server.url + '/bundle', 'cancel-at-zero'), event => {
    if (event.bytes === 0) store.cancel(event.task_id)
  }), /cancelled/)
  assert.equal(store.info().pending, null)
  assert.equal(fs.readdirSync(join(env.root, 'bundle_updates')).some(name => name.startsWith('download-')), false)
})

test('HarmonyOS space and version/channel rules refuse preparation before transport', async t => {
  const env = native(t, { free: 0 }), store = env.make()
  store.beginLaunch()
  await assert.rejects(store.prepare(env.request('https://example.com/bundle'), () => {}), /insufficient_space/)
  const manifest = JSON.parse(vector.raw_manifest)
  assert.throws(() => env.protocol.newUpdate(manifest, manifest, env.host), /update_not_newer/)
  const stable = { ...env.host, channel: 'stable', version: '1.9.0' }
  assert.doesNotThrow(() => env.protocol.newUpdate({ ...manifest, version: '1.10.0' }, stable, stable))
  assert.throws(() => env.protocol.newUpdate({ ...manifest, version: '1.9.0' }, stable, stable), /update_not_newer/)
  assert.throws(() => env.protocol.newUpdate({ ...manifest, git_commit: '' }, { ...env.host, git_commit: '' }, env.host), /update_not_newer/)
})
