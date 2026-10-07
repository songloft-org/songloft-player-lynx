import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import http from 'node:http'
import https from 'node:https'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runInNewContext } from 'node:vm'
import test from 'node:test'
import ts from 'typescript'

// Execute actual ArkTS against real local HTTP/TLS; the SDK adapter is not a device test.
function fixture(t) {
  const configs = [], callbacks = []
  let sessions = 0, closes = 0
  const globals = {
    ArrayBuffer, Uint8Array,
    url: { URL: class extends URL { static parseURL(value) { return new URL(value) } } },
    LynxTemplateResourceFetcher: class {},
    rcp: {
      Request: class { constructor(address, method) { this.url = address; this.method = method } },
      createSession: () => {
        sessions++
        const active = new Map()
        return {
          fetch: request => new Promise((resolve, reject) => {
            configs.push(request.configuration)
            const transport = request.url.startsWith('https:') ? https : http
            const connection = transport.get(request.url, {
              rejectUnauthorized: request.configuration.security.remoteValidation !== 'skip',
            }, response => {
              const events = request.configuration.tracing.httpEventsHandler
              events.onHeaderReceive(response.headers)
              response.on('data', chunk => events.onDataReceive(chunk.buffer.slice(chunk.byteOffset, chunk.byteOffset + chunk.byteLength)))
              response.on('end', () => resolve({ statusCode: response.statusCode }))
              response.on('error', reject)
            })
            active.set(request, { connection, reject })
            connection.on('error', reject)
          }),
          cancel: request => {
            const job = active.get(request)
            job?.connection.destroy()
            job?.reject(new Error('cancelled'))
          },
          close: () => { closes++; for (const job of active.values()) job.connection.destroy(); active.clear() },
        }
      },
    },
  }
  for (const name of ['InsecureTls', 'SongloftTemplateResourceFetcher']) {
    const source = readFileSync(new URL(`../../harmony/entry/src/main/ets/net/${name}.ets`, import.meta.url), 'utf8').replace(/^import .*$/gm, '')
    const result = ts.transpileModule(source, { reportDiagnostics: true, compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } })
    assert.equal(result.diagnostics.filter(d => d.category === ts.DiagnosticCategory.Error).length, 0)
    const exports = {}
    runInNewContext(result.outputText, { ...globals, exports })
    Object.assign(globals, exports)
  }
  const make = (maxBytes = 1024) => new globals.SongloftTemplateResourceFetcher(maxBytes)
  const fetch = (loader, address) => new Promise(resolve => {
    const delivery = { count: 0 }
    callbacks.push(delivery)
    loader.fetchTemplate({ url: address }, (error, value) => {
      delivery.count++
      resolve({ error, value })
    })
  })
  t.after(() => {
    assert.equal(closes, sessions, 'all RCP sessions are closed')
    for (const delivery of callbacks) assert.equal(delivery.count, 1, 'template callback exactly once')
    assert.equal(globals.InsecureTls.listeners.length, 0, 'no stale TLS listeners')
  })
  return { make, fetch, configs, tls: globals.InsecureTls }
}

async function server(t, secure = false) {
  const seen = []
  let slowResponse
  const handle = (request, response) => {
    seen.push(request.headers)
    if (request.url === '/slow') { slowResponse = response; response.write('abc'); return }
    if (request.url === '/404') { response.writeHead(404); response.end('bad'); return }
    if (request.url === '/empty') { response.end(); return }
    const data = Buffer.from([0, 1, 127, 128, 255])
    if (request.url === '/large') { response.setHeader('Content-Length', 32); response.end(Buffer.alloc(32)); return }
    if (request.url === '/chunked') { response.write(Buffer.alloc(32)); response.end(); return }
    response.setHeader('Content-Length', data.length)
    response.end(data)
  }
  let instance
  if (secure) {
    const root = mkdtempSync(join(tmpdir(), 'lynx-plugin-template-tls-'))
    t.after(() => rmSync(root, { recursive: true, force: true }))
    execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', join(root, 'key.pem'), '-out', join(root, 'cert.pem'), '-days', '1', '-subj', '/CN=localhost'], { stdio: 'ignore' })
    instance = https.createServer({ key: readFileSync(join(root, 'key.pem')), cert: readFileSync(join(root, 'cert.pem')) }, handle)
  } else instance = http.createServer(handle)
  await new Promise(resolve => instance.listen(0, '127.0.0.1', resolve))
  t.after(() => { slowResponse?.destroy(); instance.closeAllConnections(); instance.close() })
  return { base: `${secure ? 'https' : 'http'}://127.0.0.1:${instance.address().port}`, seen }
}

test('binary loading uses bounded transfer settings without account headers', async t => {
  const h = fixture(t), s = await server(t)
  const result = await h.fetch(h.make(), s.base + '/bundle')
  assert.equal(result.error, undefined)
  assert.deepEqual([...new Uint8Array(result.value.binary)], [0, 1, 127, 128, 255])
  assert.equal(s.seen[0].authorization, undefined)
  assert.equal(s.seen[0].cookie, undefined)
  assert.equal(h.configs[0].transfer.timeout.transferMs, 30000)
  assert.equal(h.configs[0].transfer.maxAutoRedirects, 5)
  assert.equal(h.configs[0].security.remoteValidation, 'system')
})

test('HTTP errors and empty templates report failure rather than success', async t => {
  const h = fixture(t), s = await server(t)
  for (const [path, message] of [['/404', 'Plugin template HTTP 404'], ['/empty', 'Empty plugin template']]) {
    const result = await h.fetch(h.make(), s.base + path)
    assert.equal(result.error.message, message)
    assert.equal(result.value.binary, undefined)
  }
})

test('declared and chunked length limits cancel and close actual requests', async t => {
  const h = fixture(t), s = await server(t)
  for (const path of ['/large', '/chunked']) {
    const result = await h.fetch(h.make(16), s.base + path)
    assert.equal(result.error.message, 'Plugin template too large')
    assert.equal(result.value.binary, undefined)
  }
})

test('unsupported and credential URLs never create a session', async t => {
  const h = fixture(t)
  for (const address of ['file:///etc/passwd', 'http://user:secret@localhost/bundle', 'http://localhost/\nfile']) {
    const result = await h.fetch(h.make(), address)
    assert.equal(result.error.message, 'Invalid plugin template URL')
  }
  assert.equal(h.configs.length, 0)
})

test('actual self-signed TLS is rejected, allowed explicitly, then rejected again', async t => {
  const h = fixture(t), s = await server(t, true)
  assert.ok((await h.fetch(h.make(), s.base + '/bundle')).error)
  h.tls.setEnabled(true)
  assert.equal((await h.fetch(h.make(), s.base + '/bundle')).error, undefined)
  h.tls.setEnabled(false)
  assert.ok((await h.fetch(h.make(), s.base + '/bundle')).error)
})

test('TLS changes cancel an active stream without leaving a listener', { timeout: 5000 }, async t => {
  const h = fixture(t), s = await server(t)
  const pending = h.fetch(h.make(), s.base + '/slow')
  while (s.seen.length === 0) await new Promise(resolve => setTimeout(resolve, 5))
  h.tls.setEnabled(true)
  const result = await pending
  assert.equal(result.error.message, 'TLS policy changed')
  assert.equal(h.tls.listeners.length, 0)
})

test('closing one session preserves another active template request', { timeout: 5000 }, async t => {
  const h = fixture(t), s = await server(t)
  const loader = h.make()
  const slow = h.fetch(loader, s.base + '/slow')
  while (s.seen.length === 0) await new Promise(resolve => setTimeout(resolve, 5))
  const fast = await h.fetch(loader, s.base + '/bundle')
  assert.equal(fast.error, undefined)
  assert.equal(h.tls.listeners.length, 1, 'slow request remains registered')
  h.tls.setEnabled(true)
  assert.equal((await slow).error.message, 'TLS policy changed')
  assert.equal(h.tls.listeners.length, 0)
})

test('unsupported SSR calls back once with an error', t => {
  const h = fixture(t)
  let count = 0
  h.make().fetchSSRData({ url: 'https://example.invalid/' }, (error, data) => {
    count++
    assert.equal(error.message, 'SSR data is not supported')
    assert.equal(data.byteLength, 0)
  })
  assert.equal(count, 1)
})
