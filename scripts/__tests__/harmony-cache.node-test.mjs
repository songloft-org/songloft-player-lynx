import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import * as fs from 'node:fs'
import http from 'node:http'
import https from 'node:https'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { runInNewContext } from 'node:vm'
import test from 'node:test'
import ts from 'typescript'

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const prefix = 'harmony/entry/src/main/ets/modules/cache/'
const body = Buffer.alloc(32768, 109)

// Execute real ArkTS source against real files/HTTP/TLS. This does not compile ArkTS or validate the device SDK.
function native(t, options = {}) {
  const root = fs.mkdtempSync(join(tmpdir(), 'lynx-harmony-cache-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const fileIo = {
    OpenMode: { CREATE: fs.constants.O_CREAT, READ_ONLY: fs.constants.O_RDONLY, WRITE_ONLY: fs.constants.O_WRONLY, TRUNC: fs.constants.O_TRUNC },
    mkdirSync: (path, recursive = false) => fs.mkdirSync(path, { recursive }), accessSync: fs.existsSync,
    openSync: (path, mode) => ({ fd: fs.openSync(path.startsWith('file://') ? fileURLToPath(path) : path, mode, 0o600) }), closeSync: fs.closeSync,
    fsyncSync: fs.fsyncSync, statSync: fs.statSync, readTextSync: path => fs.readFileSync(path, 'utf8'),
    writeSync: (fd, data) => fs.writeSync(fd, new Uint8Array(data)), renameSync: fs.renameSync,
    unlinkSync: fs.unlinkSync, listFileSync: fs.readdirSync, rmdirSync: path => fs.rmSync(path, { recursive: true }),
  }
  const globals = {
    ArrayBuffer, Uint8Array, fileIo, fileUri: { getUriFromPath: path => pathToFileURL(path).href },
    util: { TextEncoder: class { encodeInto(text) { return new TextEncoder().encode(text) } } },
    cryptoFramework: { createMd: algorithm => {
      assert.equal(algorithm, 'SHA256'); const hash = createHash('sha256')
      return { updateSync: data => hash.update(data.data), digestSync: () => ({ data: new Uint8Array(hash.digest()) }) }
    } },
    url: { URL: class extends URL { static parseURL(value) { return new URL(value) } } },
    systemDateTime: { TimeType: { STARTUP: 0 }, getUptime: () => performance.now() },
    statfs: { getFreeSizeSync: path => options.free ?? fs.statfsSync(path).bavail * fs.statfsSync(path).bsize },
    rcp: { Request: class { constructor(url, method) { this.url = url; this.method = method } }, createSession: () => {
      const active = new Map()
      return {
        fetch: request => new Promise((done, fail) => {
          assert.equal(request.configuration.transfer.autoRedirect, false)
          const client = request.url.startsWith('https:') ? https : http
          const connection = client.get(request.url, { ca: options.ca, rejectUnauthorized: request.configuration.security.remoteValidation !== 'skip' }, response => {
            const events = request.configuration.tracing.httpEventsHandler
            events.onHeaderReceive(response.headers)
            response.on('data', chunk => events.onDataReceive(chunk.buffer.slice(chunk.byteOffset, chunk.byteOffset + chunk.length)))
            response.on('end', () => done({ statusCode: response.statusCode, headers: response.headers }))
            response.on('error', fail)
          })
          active.set(request, { connection, fail }); connection.on('error', fail)
        }),
        cancel: request => { const value = active.get(request); if (value) { value.connection.destroy(); value.fail(new Error('cancelled')) } },
        close: () => { for (const value of active.values()) value.connection.destroy() },
      }
    } },
  }
  const load = path => {
    const source = fs.readFileSync(join(repo, path), 'utf8').replace(/^import .*$/gm, '')
    const result = ts.transpileModule(source, { reportDiagnostics: true, compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } })
    assert.equal(result.diagnostics.filter(d => d.category === ts.DiagnosticCategory.Error).length, 0)
    const exports = {}; runInNewContext(result.outputText, { ...globals, exports }); Object.assign(globals, exports)
    return exports
  }
  load('harmony/entry/src/main/ets/net/InsecureTls.ets'); load(prefix + 'SongCacheTransfer.ets')
  const Store = load(prefix + 'SongCacheStore.ets').SongCacheStore
  return { root, make: () => new Store(root), tls: globals.InsecureTls, load }
}
async function endpoint(t, tls = false) {
  const counts = new Map()
  const handle = (request, response) => {
    const path = new URL(request.url, 'http://fixture').pathname
    counts.set(path, (counts.get(path) ?? 0) + 1)
    if (path === '/redirect') { response.writeHead(302, { location: '/media', 'content-type': 'text/html' }); response.end('redirect'); return }
    if (path === '/hls') { response.writeHead(200, { 'content-type': 'application/vnd.apple.mpegurl' }); response.end('#EXTM3U'); return }
    if (path === '/partial') { response.writeHead(206, { 'content-type': 'audio/mpeg', 'content-range': 'bytes 0-10/100' }); response.end('partial'); return }
    if (path === '/slow') {
      response.writeHead(200, { 'content-type': 'audio/mpeg' }); response.write(body.subarray(0, 4096))
      const timer = setTimeout(() => response.end(body), 1000); response.on('close', () => clearTimeout(timer)); return
    }
    if (path === '/unknown') { response.writeHead(200, { 'content-type': 'audio/mpeg' }); response.write(body.subarray(0, 4096)); response.end(body.subarray(4096)); return }
    response.writeHead(200, { 'content-type': 'audio/mpeg', 'content-length': body.length }); response.end(body)
  }
  let options = {}
  if (tls) {
    const root = fs.mkdtempSync(join(tmpdir(), 'lynx-cache-tls-')); t.after(() => fs.rmSync(root, { recursive: true, force: true }))
    execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=localhost',
      '-addext', 'subjectAltName=IP:127.0.0.1,DNS:localhost', '-keyout', join(root, 'key.pem'), '-out', join(root, 'cert.pem')], { stdio: 'ignore' })
    options = { cert: fs.readFileSync(join(root, 'cert.pem')), key: fs.readFileSync(join(root, 'key.pem')) }
  }
  const server = tls ? https.createServer(options, handle) : http.createServer(handle)
  await new Promise(done => server.listen(0, '127.0.0.1', done))
  t.after(() => new Promise(done => { server.closeAllConnections(); server.close(done) }))
  return { url: `${tls ? 'https' : 'http'}://127.0.0.1:${server.address().port}`, counts }
}
function request(server, id, options = {}) {
  const namespace = JSON.stringify([options.profile ?? 'profile', server + '/部署', options.user ?? 'user'])
  return JSON.stringify({ task_id: id, namespace,
    key: JSON.stringify([namespace, '7', options.track ?? 'default', 'original', '0', 'revision', 'flac']),
    snapshot: { id: 7, type: 'local', title: '测试', artist: '', album: '', duration: 10, isVideo: false,
      format: 'flac', updatedAt: 'revision', url: 'NEVER_PERSIST', access_token: 'NEVER_PERSIST' },
    url: server + (options.path ?? '/media'), max_bytes: options.maximum ?? 8 * 1024 * 1024 })
}
const cache = (store, input, progress = () => {}) => Promise.resolve().then(() => store.cacheEntry(input, progress))

test('HarmonyOS cache separates server/profile/user/track, records MIME and whitelists snapshots', async t => {
  const env = native(t), store = env.make(), server = await endpoint(t)
  const results = []
  for (const [id, options] of [['one', {}], ['track', { track: '1' }], ['user', { user: 'other' }], ['profile', { profile: 'other' }]]) {
    const entry = await cache(store, request(server.url, id, options)); results.push(entry)
    assert.equal(entry.cached, true); assert.equal(JSON.parse(entry.key)[6], 'mp3')
    assert.deepEqual(fs.readFileSync(fileURLToPath(entry.url)), body)
    assert.equal(fs.readFileSync(join(dirname(fileURLToPath(entry.url)), 'entry.json'), 'utf8').includes('NEVER_PERSIST'), false)
    assert.deepEqual(Object.keys(entry.snapshot).sort(), ['id', 'type', 'title', 'artist', 'album', 'duration', 'isVideo', 'format', 'updatedAt'].sort())
  }
  assert.equal(new Set(results.map(e => e.url)).size, 4)
  const duplicate = await cache(store, request(server.url, 'repeat'))
  assert.equal(duplicate.url, results[0].url); assert.equal(server.counts.get('/media'), 4)
  const ns = results[0].namespace
  assert.equal(store.listEntries(JSON.stringify({ namespace: ns })).total, 2)
  assert.equal(env.make().getEntry(JSON.stringify({ namespace: ns, key: results[0].key })).cached, true)
})
test('HarmonyOS cache enforces shared legacy/indexed and unknown-length capacity without committing partials', async t => {
  const env = native(t), store = env.make(), server = await endpoint(t)
  fs.writeFileSync(join(env.root, '123.mp3'), Buffer.alloc(4096))
  await assert.rejects(cache(store, request(server.url, 'limit', { maximum: 8000 })), /limit_exceeded/)
  await assert.rejects(cache(store, request(server.url, 'unknown', { maximum: 8000, path: '/unknown' })), /limit_exceeded/)
  assert.equal(store.size(), 4096); assert.deepEqual(fs.readdirSync(join(env.root, 'staging')), [])
  assert.equal(store.getTasks().every(task => task.status === 'failed'), true)
})
test('HarmonyOS real cancellation and pre-enqueue cancellation stop files/connections before callback', async t => {
  const env = native(t), store = env.make(), server = await endpoint(t)
  const slow = cache(store, request(server.url, 'slow', { path: '/slow' }), event => { if (event.bytes > 0) store.cancel('slow') })
  store.cancel('queued')
  const queued = cache(store, request(server.url, 'queued', { path: '/queued', track: '1' }))
  const settled = await Promise.allSettled([slow, queued])
  assert.equal(settled.every(result => result.status === 'rejected' && /cancelled/.test(result.reason.message)), true)
  assert.equal(server.counts.get('/queued'), undefined)
  assert.equal(store.size(), 0); assert.deepEqual(fs.readdirSync(join(env.root, 'staging')), [])
  assert.equal(store.getTasks().every(task => task.status === 'cancelled'), true)
})
test('HarmonyOS redirects remain bounded and media guards reject HLS/range responses', async t => {
  const env = native(t), store = env.make(), server = await endpoint(t)
  const entry = await cache(store, request(server.url, 'redirect', { path: '/redirect' }))
  assert.deepEqual(fs.readFileSync(fileURLToPath(entry.url)), body)
  await assert.rejects(cache(store, request(server.url, 'hls', { path: '/hls', track: '1' })), /unsupported_media/)
  await assert.rejects(cache(store, request(server.url, 'partial', { path: '/partial', track: '2' })), /unsupported_media/)
})
test('HarmonyOS serial queue rejects duplicate variants and overflow, then continues after cancellation', async t => {
  const env = native(t), store = env.make(), server = await endpoint(t)
  const pending = []
  // Enqueue synchronously so every request is waiting before the serial writer starts.
  for (let index = 0; index < 32; index++) {
    pending.push(store.cacheEntry(request(server.url, `queued${index}`, { track: String(index), path: '/slow' }), () => {}))
  }
  assert.throws(() => store.cacheEntry(request(server.url, 'overflow', { track: '33' }), () => {}), /cache_queue_full/)
  for (let index = 0; index < 32; index++) store.cancel(`queued${index}`)
  const outcomes = await Promise.allSettled(pending)
  assert.equal(outcomes.every(result => result.status === 'rejected' && result.reason.message === 'cancelled'), true)
  assert.equal(server.counts.size, 0)
  const active = store.cacheEntry(request(server.url, 'active', { path: '/slow' }), () => {})
  assert.throws(() => store.cacheEntry(request(server.url, 'duplicate'), () => {}), /cache_busy/)
  store.cancel('active'); await assert.rejects(active, /cancelled/)
  const legacy = await store.legacyDownload('99', server.url + '/media', 'mp3', 8 * 1024 * 1024)
  assert.deepEqual(fs.readFileSync(fileURLToPath(legacy.url)), body)
  const next = await cache(store, request(server.url, 'after-cancel'))
  assert.equal(next.cached, true); assert.equal(store.size(), body.length * 2)
  assert.equal(store.legacyInfo('99').cached, true)
  await store.legacyRemove('99'); assert.equal(store.size(), body.length)
})
test('HarmonyOS namespace and legacy cleanup preserve unrelated files; restart rejects missing media and marks interruption', async t => {
  const env = native(t), store = env.make(), server = await endpoint(t)
  const first = await cache(store, request(server.url, 'one')), other = await cache(store, request(server.url, 'other', { user: 'other' }))
  fs.writeFileSync(join(env.root, '123.mp3'), body)
  await store.clearNamespace(first.namespace)
  assert.equal(fs.existsSync(fileURLToPath(other.url)), true); assert.equal(fs.existsSync(join(env.root, '123.mp3')), true)
  await store.clearLegacy(); assert.equal(store.size(), body.length)
  fs.mkdirSync(join(env.root, 'staging/orphan')); fs.writeFileSync(join(env.root, 'tasks/restart.json'), JSON.stringify({ task_id: 'restart', namespace: other.namespace, key: other.key, status: 'downloading', bytes: 10, total: 100, error: null }))
  fs.unlinkSync(fileURLToPath(other.url)); const restarted = env.make()
  assert.equal(restarted.listEntries(JSON.stringify({ namespace: other.namespace })).total, 0)
  assert.equal(restarted.getTasks().find(task => task.task_id === 'restart').status, 'interrupted')
  assert.deepEqual(fs.readdirSync(join(env.root, 'staging')), [])
})
test('HarmonyOS default TLS rejects self-signed media; explicit opt-in accepts and tightening cancels the active session', async t => {
  const env = native(t), store = env.make(), server = await endpoint(t, true)
  await assert.rejects(cache(store, request(server.url, 'tls-default')), /download_failed/)
  env.tls.setEnabled(true)
  const entry = await cache(store, request(server.url, 'tls-enabled'))
  assert.equal(entry.cached, true)
  await assert.rejects(cache(store, request(server.url, 'tls-tightened', { path: '/slow', track: '1' }), event => {
    if (event.bytes > 0) env.tls.setEnabled(false)
  }), /cancelled/)
  assert.equal(env.tls.isEnabled(), false)
  assert.equal(store.getTasks().find(task => task.task_id === 'tls-tightened').status, 'cancelled')
  await assert.rejects(cache(store, request(server.url, 'tls-again', { track: '2' })), /download_failed/)
})
test('HarmonyOS rejects invalid identity/paths/radio and insufficient space before streaming', async t => {
  const env = native(t, { free: 1 }), store = env.make(), server = await endpoint(t)
  await assert.rejects(cache(store, request(server.url, 'space')), /insufficient_space/)
  for (const change of [value => { value.task_id = '../escape' }, value => { value.snapshot.type = 'radio' }, value => { value.namespace = JSON.stringify(['profile', 'https://user:secret@example.com', 'u']) }]) {
    const input = JSON.parse(request(server.url, 'bad')); change(input)
    await assert.rejects(cache(store, JSON.stringify(input)), /invalid_cache_request/)
  }
  assert.equal(server.counts.size, 0)
})
test('HarmonyOS local audio source hands real encoded file URIs to AVPlayer through owned descriptors', t => {
  const env = native(t)
  const Source = env.load('harmony/entry/src/main/ets/modules/audio/LocalAudioSource.ets').LocalAudioSource
  const source = new Source()
  const path = join(env.root, '带 空格.mp3'); fs.writeFileSync(path, body)
  let descriptor = -1
  const player = { set url(value) {
    if (value.startsWith('fd://')) {
      descriptor = Number(value.slice(5)); assert.equal(fs.fstatSync(descriptor).size, body.length)
    } else assert.equal(value, 'https://example.test/audio')
  } }
  source.assign(player, pathToFileURL(path).href)
  const first = descriptor
  source.assign(player, 'https://example.test/audio')
  assert.throws(() => fs.fstatSync(first), /EBADF/)
  source.assign(player, pathToFileURL(path).href)
  source.close(); assert.throws(() => fs.fstatSync(descriptor), /EBADF/)
  source.close()
  const broken = { set url(value) { descriptor = Number(value.slice(5)); throw new Error('player failed') } }
  assert.throws(() => source.assign(broken, pathToFileURL(path).href), /player failed/)
  assert.throws(() => fs.fstatSync(descriptor), /EBADF/)
  assert.throws(() => source.assign(player, pathToFileURL(join(env.root, 'missing.mp3')).href), /ENOENT/)
})
