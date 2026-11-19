import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile, rm, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:http'
import { EventEmitter, once } from 'node:events'
import { JsonStore } from '../host/json-store.mjs'
import { desktopIdentity } from '../host/identity.mjs'
import { createDesktopStorage } from '../host/storage.mjs'
import { HostNetwork } from '../host/network.mjs'
import { createHostRpc } from '../host/rpc.mjs'
import { singleInstance } from '../host/single-instance.mjs'
import { DesktopSession } from '../host/session.mjs'
import { DesktopBackend, unavailableMusicDirectory } from '../host/backend.mjs'

test('an unavailable music folder is reported before accessing credentials or starting Go', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'songloft-missing-music-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  const file = join(dir, 'regular-file')
  await writeFile(file, 'music fixture')
  const backend = new DesktopBackend({
    executable: join(dir, 'songloft'),
    toolsDirectory: dir,
    dataDirectory: join(dir, 'data'),
    credentials: () =>
      assert.fail('credentials read before music folder validation'),
    spawnProcess: () =>
      assert.fail('backend spawned without a readable music folder'),
  })
  for (const path of [join(dir, 'missing'), file]) {
    await assert.rejects(backend.start(path), {
      message: unavailableMusicDirectory,
    })
    assert.deepEqual(backend.state, {
      state: 'failed',
      address: null,
      error: unavailableMusicDirectory,
    })
  }
})

test('reselecting an unavailable music folder preserves preferences until startup succeeds', async () => {
  const saved = '/fixture/unavailable'
  const chosen = '/fixture/selected'
  const prefs = new Map([
    ['desktop.mode', 'local'],
    ['desktop.musicDirectory', saved],
  ])
  const backend = new EventEmitter()
  let selected = null
  let canStart = false
  let confirmations = 0
  Object.assign(backend, {
    state: { state: 'failed', error: unavailableMusicDirectory },
    async start(music) {
      assert.equal(music, chosen)
      if (!canStart) throw new Error(unavailableMusicDirectory)
      return (this.state = {
        state: 'running',
        address: 'http://127.0.0.1:24191',
      })
    },
  })
  const session = new DesktopSession({
    backend,
    storage: { prefs },
    platform: { stop() {}, pickDirectory: async () => selected },
    cache: { async cancelAll() {} },
    network: { cancelAll() {} },
    player: { async command() {} },
    prepare: async () => {},
    publish: () => {},
    credentials: async () => {},
    confirmUpdate: async () => {
      confirmations++
    },
  })
  assert.equal(
    (await session.local({ chooseMusicDirectory: true })).address,
    undefined,
  )
  assert.equal(prefs.get('desktop.musicDirectory'), saved)
  selected = chosen
  await assert.rejects(session.local({ chooseMusicDirectory: true }), {
    message: unavailableMusicDirectory,
  })
  assert.equal(prefs.get('desktop.musicDirectory'), saved)
  assert.equal(confirmations, 0)
  canStart = true
  assert.equal(
    (await session.local({ chooseMusicDirectory: true })).address,
    backend.state.address,
  )
  assert.equal(prefs.get('desktop.musicDirectory'), chosen)
  assert.equal(confirmations, 1)
})

test('the update waits for the current transition and holds the backend stopped for backup', async () => {
  const open = Promise.withResolvers()
  const starting = Promise.withResolvers()
  const prefs = new Map([['desktop.musicDirectory', '/fixture/music']])
  const backend = new EventEmitter()
  const operations = []
  Object.assign(backend, {
    state: { state: 'stopped' },
    async start() {
      operations.push('start')
      starting.resolve()
      await open.promise
      return (this.state = {
        state: 'running',
        address: 'http://127.0.0.1:31415',
      })
    },
    async stop() {
      operations.push('stop')
      this.state = { state: 'stopped' }
    },
  })
  const session = new DesktopSession({
    backend,
    storage: { prefs },
    platform: { stop() {} },
    network: { cancelAll() {} },
    cache: { async cancelAll() {} },
    player: { async command() {} },
    credentials: async () => {},
    prepare: async (mode) => operations.push(mode),
    publish: () => {},
  })
  const local = session.local({ initial: true })
  await starting.promise
  const updating = session.stopForUpdate()
  await assert.rejects(session.local(), /Session is stopping/)
  await assert.rejects(session.remote(), /Session is stopping/)
  assert.deepEqual(operations, ['start'])
  open.resolve()
  await local
  const release = await updating
  assert.deepEqual(operations, ['start', 'update', 'stop'])
  assert.equal(backend.state.state, 'stopped')
  await assert.rejects(session.local({ restart: true }), /Session is stopping/)
  release()
  await session.local({ initial: true })
  assert.equal(backend.state.state, 'running')
  await session.close()
})

test('atomic store preserves concurrent writes, restart, prototype keys and corrupt data', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'songloft-store-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  const path = join(dir, 'prefs.json')
  const store = new JsonStore(path)
  await Promise.all(
    Array.from({ length: 32 }, (_, i) => store.set(String(i), `value-${i}`)),
  )
  await store.set('__proto__', 'ordinary-key')
  const restarted = new JsonStore(path)
  assert.equal((await restarted.keys()).length, 33)
  assert.equal(await restarted.get('__proto__'), 'ordinary-key')
  assert.equal(await restarted.get('31'), 'value-31')
  assert.deepEqual(await readdir(dir), ['prefs.json'])
  await writeFile(path, '{corrupt')
  await assert.rejects(restarted.set('x', 'y'), /Cannot read/)
  assert.equal(await readFile(path, 'utf8'), '{corrupt')
})

test('channel identities and DPAPI ciphertext remain isolated across restart', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'songloft-secrets-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  const identity = desktopIdentity({ channel: 'dev', appData: dir })
  assert.notEqual(
    identity.data,
    desktopIdentity({ channel: 'stable', appData: dir }).data,
  )
  const native = {
    protectSecret: (entropy, value) =>
      Buffer.from(`${entropy}|${value.toString('hex')}`),
    unprotectSecret(entropy, value) {
      assert.ok(value.toString().startsWith(`${entropy}|`))
      return Buffer.from(value.toString().slice(entropy.length + 1), 'hex')
    },
  }
  await createDesktopStorage({
    identity,
    native,
    platform: 'win32',
  }).secure.set('password', 'test-secret-value')
  const disk = await readFile(
    join(identity.data, 'credentials.dpapi.json'),
    'utf8',
  )
  assert.ok(!disk.includes('test-secret-value'))
  assert.equal(
    await createDesktopStorage({
      identity,
      native,
      platform: 'win32',
    }).secure.get('password'),
    'test-secret-value',
  )
  await assert.rejects(
    createDesktopStorage({
      identity,
      native: {},
      platform: 'linux',
    }).secure.set('x', 'y'),
    /unavailable/,
  )
})

test('macOS credentials await Keychain operations without a local file fallback', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'songloft-keychain-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  const identity = desktopIdentity({ channel: 'dev', appData: dir })
  const values = new Map()
  const native = {
    async secureGet(service, key) {
      assert.equal(service, identity.id)
      return values.get(key) ?? null
    },
    async secureSet(service, key, value) {
      assert.equal(service, identity.id)
      values.set(key, value)
    },
    async secureRemove(service, key) {
      assert.equal(service, identity.id)
      values.delete(key)
    },
  }
  const storage = createDesktopStorage({ identity, native, platform: 'darwin' })
  await storage.secure.set('test-password', 'secret-value')
  assert.equal(await storage.secure.get('test-password'), 'secret-value')
  await storage.secure.remove('test-password')
  assert.equal(await storage.secure.get('test-password'), null)
  await assert.rejects(readFile(join(identity.data, 'credentials.dpapi.json')))
})

test('development data roots isolate Keychain and Windows CEF identities', async () => {
  const values = new Map()
  const native = {
    async secureGet(service, key) {
      return values.get(service)?.get(key) ?? null
    },
    async secureSet(service, key, value) {
      if (!values.has(service)) values.set(service, new Map())
      values.get(service).set(key, value)
    },
  }
  const profile = (appData, isolateProfile) =>
    desktopIdentity({ channel: 'dev', appData, isolateProfile })
  const credentials = (appData, isolateProfile) =>
    createDesktopStorage({
      identity: profile(appData, isolateProfile),
      native,
      platform: 'darwin',
    }).secure
  const standard = credentials('/default', false)
  const isolated = credentials('/diagnostic', true)
  const standardIdentity = profile('/default', false)
  const isolatedIdentity = profile('/diagnostic', true)
  assert.equal(standardIdentity.appUserModelId, standardIdentity.id)
  assert.notEqual(isolatedIdentity.appUserModelId, standardIdentity.appUserModelId)
  assert.notEqual(
    isolatedIdentity.appUserModelId,
    profile('/another', true).appUserModelId,
  )
  assert.equal(isolatedIdentity.id, standardIdentity.id)
  await standard.set('bundle.adminPassword', 'normal')
  assert.equal(await isolated.get('bundle.adminPassword'), null)
  await isolated.set('bundle.adminPassword', 'diagnostic')
  assert.equal(await standard.get('bundle.adminPassword'), 'normal')
  assert.equal(
    await credentials('/diagnostic', true).get('bundle.adminPassword'),
    'diagnostic',
  )
  assert.equal(
    await credentials('/another', true).get('bundle.adminPassword'),
    null,
  )
})

test('network transmits headers/body, bounds deadlines and cancels server work', async (t) => {
  const server = createServer(async (req, res) => {
    if (req.url === '/hang') return
    let body = ''
    for await (const chunk of req) body += chunk
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ token: req.headers.authorization, body }))
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const network = new HostNetwork()
  t.after(async () => {
    await network.close()
    server.closeAllConnections()
    await new Promise((resolve) => server.close(resolve))
  })
  const url = `http://127.0.0.1:${server.address().port}`
  const response = await network.request({
    url,
    method: 'POST',
    headers: { Authorization: 'Bearer abc' },
    body: 'payload',
  })
  assert.deepEqual(JSON.parse(response.body), {
    token: 'Bearer abc',
    body: 'payload',
  })
  await assert.rejects(network.request({ url: `${url}/hang`, timeoutMs: 30 }))
  const pending = network.request({ url: `${url}/hang` })
  network.cancelAll()
  await assert.rejects(pending)
  await assert.rejects(network.fetch('file:///etc/passwd'), /Invalid request/)
})

test('RPC rejects missing root token, unknown methods and plugin process access', async () => {
  const dispatch = createHostRpc({ token: 'root-secret' })
  for (const raw of [
    '{}',
    JSON.stringify({ token: 'wrong', method: 'storage.get' }),
    JSON.stringify({ token: 'root-secret', method: 'process.exec' }),
  ])
    assert.equal(JSON.parse(await dispatch(raw)).ok, false)
})

test('second instance activates the first and releases the OS socket', async (t) => {
  let activations = 0
  const id = `org.songloft.test.${process.pid}.${Date.now()}`
  const first = await singleInstance(id, () => activations++)
  t.after(() => first.close())
  assert.equal(first.primary, true)
  const second = await singleInstance(id, () =>
    assert.fail('secondary cannot own listener'),
  )
  assert.equal(second.primary, false)
  await new Promise((resolve) => setTimeout(resolve, 25))
  assert.equal(activations, 1)
})
