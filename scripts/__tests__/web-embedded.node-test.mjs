import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

test('default HTTP hosting does not depend on synchronous shared-memory RPC endpoints', () => {
  const source = readFileSync(join(root, 'node_modules/@lynx-js/web-core/dist/client/endpoints.js'), 'utf8')
  const endpoints = [...source.matchAll(/createRpcEndpoint\(\s*(['"])([^'"]+)\1,\s*(true|false)/g)]
  assert.ok(endpoints.length > 0, 'Endpoint audit must inspect the installed engine')
  assert.equal(endpoints.length, (source.match(/createRpcEndpoint\s*\(/g) ?? []).length,
    'Every endpoint declaration must be included in the audit')
  assert.deepEqual(endpoints.filter(match => match[3] === 'true').map(match => match[2]), [],
    'Reassess ordinary HTTP support when adding synchronous shared-memory RPC')
})

function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'songloft-embedded-web-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const repo = join(dir, 'client')
  const core = join(repo, 'node_modules/@lynx-js/web-core/dist/client_prod/static')
  const mpegts = 'node_modules/mpegts.js'
  for (const folder of ['scripts', 'web', 'dist/web', 'node_modules/@lynx-js/web-core/dist/client_prod/static/css']) {
    mkdirSync(join(repo, folder), { recursive: true })
  }
  mkdirSync(join(repo, mpegts, 'dist'), { recursive: true })
  for (const name of ['dist/mpegts.js', 'dist/mpegts.js.LICENSE.txt', 'LICENSE']) {
    cpSync(join(root, mpegts, name), join(repo, mpegts, name))
  }
  cpSync(join(root, 'scripts/copy-bundle-web.mjs'), join(repo, 'scripts/copy-bundle-web.mjs'))
  for (const file of readdirSync(join(root, 'web'), { withFileTypes: true })) {
    if (file.isFile()) cpSync(join(root, 'web', file.name), join(repo, 'web', file.name))
  }
  writeFileSync(join(core, 'css/client.css'), '/* fixture */')
  const html = readFileSync(join(repo, 'web/index.html'), 'utf8')
  for (const match of html.matchAll(/(?:src|href)=["']\.\/web-core\/static\/([^"']+)["']/g)) {
    const asset = join(core, match[1])
    mkdirSync(dirname(asset), { recursive: true })
    writeFileSync(asset, 'engine fixture')
  }
  writeFileSync(join(repo, 'dist/web/main.web.bundle'), '// compiled web fixture')
  const out = join(dir, 'output')
  const copy = (embedded, goEmbed = false) => execFileSync(process.execPath,
    [join(repo, 'scripts/copy-bundle-web.mjs'), ...(embedded ? ['--embedded'] : []), ...(goEmbed ? ['--go-embed'] : []), '--out-dir', out],
    { encoding: 'utf8' })
  return { out, copy }
}

test('embedded assets resolve from root and BASE_PATH even for legacy SPA bookmarks', t => {
  const { out, copy } = fixture(t)
  copy(true, true)
  const html = readFileSync(join(out, 'index.html'), 'utf8')
  assert.equal((html.match(/<base href="\/">/g) ?? []).length, 1)
  assert.ok(!html.includes('global-props=\'{"deployMode":"standalone"}\''))
  for (const prefix of ['', '/songloft']) {
    const served = html.replace('<base href="/">', `<base href="${prefix}/">`)
    const base = /<base href="([^"]+)">/.exec(served)[1]
    const documentBase = new URL(base, `https://music.test${prefix}/settings/category/2`)
    assert.equal(new URL('./main.lynx.bundle', documentBase).pathname, `${prefix}/main.lynx.bundle`)
  }
  writeFileSync(join(out, 'flutter.js'), 'obsolete Flutter file')
  copy(true, true)
  assert.ok(!readdirSync(out).includes('flutter.js'))
})

test('standalone retains the document directory and server-address control', t => {
  const { out, copy } = fixture(t)
  copy(false)
  const html = readFileSync(join(out, 'index.html'), 'utf8')
  assert.ok(!html.includes('<base href="/">'))
  assert.ok(html.includes('global-props=\'{"deployMode":"standalone"}\''))
  for (const asset of ['mpegts.js', 'mpegts.js.LICENSE.txt', 'mpegts.LICENSE']) {
    assert.ok(readFileSync(join(out, asset)).length > 0)
  }
})

test('raw embedded archives retain static subdirectory hosting without a Go base rewrite', t => {
  const { out, copy } = fixture(t)
  copy(true)
  const html = readFileSync(join(out, 'index.html'), 'utf8')
  assert.ok(!html.includes('<base href="/">'))
  assert.ok(!html.includes('global-props=\'{"deployMode":"standalone"}\''))
  assert.equal(new URL('./main.lynx.bundle', 'https://music.test/songloft/').pathname, '/songloft/main.lynx.bundle')
})

test('Go-specific packaging cannot be requested for standalone mode', t => {
  const { copy } = fixture(t)
  assert.throws(() => copy(false, true), /--go-embed requires --embedded/)
})

test('the actual embedded archive verifier distinguishes base URLs from assets', t => {
  const { out, copy } = fixture(t)
  copy(true, true)
  const metadata = join(out, 'version.json')
  writeFileSync(metadata, JSON.stringify({ version: 'dev', git_commit: 'abcdef0' }))
  const archive = join(dirname(out), 'web.tar.gz')
  const pack = () => execFileSync('tar', ['-czf', archive, '-C', out, '.'])
  const verify = () => spawnSync('python3', [join(root, 'scripts/verify-package.py'), 'web-embedded', archive, metadata], { encoding: 'utf8' })
  pack()
  const valid = verify()
  assert.equal(valid.status, 0, valid.stderr)
  rmSync(join(out, 'web-core/static/js/client.js'))
  pack()
  const missing = verify()
  assert.notEqual(missing.status, 0)
  assert.match(missing.stderr, /Missing HTML asset: web-core\/static\/js\/client.js/)
})
