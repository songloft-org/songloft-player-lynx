import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import http from 'node:http'
import https from 'node:https'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { setTimeout } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const waiter = join(repo, 'scripts/wait-for-fixture.mjs')

// Execute the actual Python programs. Only DNS and the deliberate startup stall
// are injected; sockets, files, HTTP handlers and TLS use their real implementations.
const bootstrap = `
import faulthandler, runpy, socket, socketserver, sys, time
from pathlib import Path
script, mode = sys.argv[1:3]
sys.path.insert(0, str(Path(script).parent))
sys.argv = [script] + sys.argv[3:]
def forbidden_lookup(host):
    raise RuntimeError("UNEXPECTED_DNS_LOOKUP: " + host)
socket.getfqdn = forbidden_lookup
if mode == "stall":
    original_dump = faulthandler.dump_traceback_later
    def quick_dump(seconds, **kwargs):
        assert seconds == 10
        original_dump(0.2, **kwargs)
    faulthandler.dump_traceback_later = quick_dump
    original_bind = socketserver.TCPServer.server_bind
    def stalled_bind(server):
        time.sleep(10)
        original_bind(server)
    socketserver.TCPServer.server_bind = stalled_bind
runpy.run_path(script, run_name="__main__")
`

function capture(command, args, options = {}) {
  const child = spawn(command, args, { ...options, stdio: ['ignore', 'pipe', 'pipe'] })
  const output = { stdout: '', stderr: '' }
  child.stdout.on('data', data => { output.stdout += data })
  child.stderr.on('data', data => { output.stderr += data })
  const finished = new Promise((resolve, reject) => {
    child.on('error', reject)
    child.on('close', (code, signal) => resolve({ code, signal, ...output }))
  })
  return { child, output, finished }
}

function fixture(t, kind, mode = 'normal', invalidCertificate = false) {
  const root = mkdtempSync(join(tmpdir(), 'lynx-ios-fixture-'))
  let running
  t.after(async () => {
    try {
      if (running && running.child.exitCode === null && running.child.signalCode === null) {
        running.child.kill()
        await running.finished
      }
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
  const portFile = join(root, kind === 'cache' ? 'port' : 'ports.json')
  const args = ['-B', '-c', bootstrap, join(repo, `scripts/fixtures/${kind === 'cache' ? 'cache' : 'template'}-http-server.py`), mode, '--port-file', portFile]
  if (kind === 'templates') {
    const cert = join(root, 'cert.pem'), key = join(root, 'key.pem')
    if (!invalidCertificate) {
      execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=localhost', '-keyout', key, '-out', cert], { stdio: 'ignore' })
    }
    args.push('--cert', cert, '--key', key)
  }
  running = capture('python3', args, { cwd: repo })
  return { ...running, portFile }
}

async function ready(instance) {
  const result = await capture(process.execPath, [waiter, instance.portFile, String(instance.child.pid), '3000']).finished
  assert.equal(result.code, 0, `${result.stderr}\n${instance.output.stderr}`)
  assert.doesNotMatch(instance.output.stderr, /UNEXPECTED_DNS_LOOKUP/)
  return JSON.parse(readFileSync(instance.portFile, 'utf8'))
}

function request(url, options = {}) {
  return new Promise((resolve, reject) => {
    const transport = url.startsWith('https:') ? https : http
    const connection = transport.get(url, { agent: false, ...options }, response => {
      const chunks = []
      response.on('data', chunk => chunks.push(chunk))
      response.on('error', reject)
      response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, body: Buffer.concat(chunks) }))
    })
    connection.setTimeout(3000, () => connection.destroy(new Error('HTTP fixture request timed out')))
    connection.on('error', reject)
  })
}

test('actual cache fixture starts without DNS and serves media, unknown lengths and counters', { timeout: 10000 }, async t => {
  const instance = fixture(t, 'cache'), port = await ready(instance)
  const base = `http://127.0.0.1:${port}`
  const media = await request(base + '/media')
  assert.equal(media.status, 200)
  assert.equal(media.headers['content-type'], 'audio/mpeg')
  assert.deepEqual(media.body, Buffer.alloc(32768, 'm'))
  const unknown = await request(base + '/unknown')
  assert.equal(unknown.headers['content-length'], undefined)
  assert.deepEqual(unknown.body, media.body)
  const hls = await request(base + '/hls')
  assert.equal(hls.headers['content-type'], 'application/vnd.apple.mpegurl')
  const stats = await request(base + '/stats')
  assert.deepEqual(JSON.parse(stats.body), { '/media': 1, '/unknown': 1, '/hls': 1 })
  assert.match(instance.output.stdout, /Ready/)
})

test('actual template fixture starts without DNS and serves HTTP and self-signed HTTPS', { timeout: 10000 }, async t => {
  const instance = fixture(t, 'templates'), ports = await ready(instance)
  const plain = `http://127.0.0.1:${ports.http}`, secure = `https://127.0.0.1:${ports.https}`
  assert.notEqual(ports.http, ports.https)
  const httpBundle = await request(plain + '/bundle')
  assert.equal(httpBundle.status, 200)
  assert.deepEqual(httpBundle.body, Buffer.from([0, 1, 127, 128, 255]))
  await assert.rejects(request(secure + '/bundle'), /self.signed certificate/i)
  const tlsBundle = await request(secure + '/bundle', { rejectUnauthorized: false })
  assert.equal(tlsBundle.status, 200)
  assert.deepEqual(tlsBundle.body, httpBundle.body)
  const redirect = await request(plain + '/redirect')
  assert.equal(redirect.status, 302)
  assert.equal(redirect.headers.location, '/bundle')
  const stats = await request(plain + '/stats')
  assert.deepEqual(JSON.parse(stats.body), { counts: { '/bundle': 2, '/redirect': 1, '/stats': 1 }, credentials: [] })
  assert.match(instance.output.stdout, /Ready/)
})

for (const kind of ['cache', 'templates']) {
  test(`${kind} fixture emits a Python stack and startup phase when initialization stalls`, { timeout: 10000 }, async t => {
    const instance = fixture(t, kind, 'stall')
    for (let attempt = 0; attempt < 40 && !instance.output.stderr.includes('stalled_bind'); attempt++) {
      await setTimeout(50)
    }
    assert.match(instance.output.stderr, /Timeout/)
    assert.match(instance.output.stderr, /stalled_bind/)
    assert.match(instance.output.stdout, /Binding HTTP listener/)
    assert.equal(existsSync(instance.portFile), false)
    assert.equal(instance.child.exitCode, null)
  })
}

test('template certificate failure exits with a traceback before publishing readiness', { timeout: 10000 }, async t => {
  const instance = fixture(t, 'templates', 'normal', true)
  const result = await instance.finished
  assert.equal(result.code, 1)
  assert.match(result.stderr, /FileNotFoundError/)
  assert.match(result.stdout, /Loading TLS certificate/)
  assert.doesNotMatch(result.stdout, /Ready/)
  assert.equal(existsSync(instance.portFile), false)
})
