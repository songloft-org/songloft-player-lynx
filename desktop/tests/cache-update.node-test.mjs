import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, readdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash, generateKeyPairSync, sign } from 'node:crypto'
import { DesktopCache } from '../host/cache.mjs'
import { verifyManifest } from '../host/update-manifest.mjs'
import { DesktopUpdater } from '../host/updater.mjs'
import { backupDatabase, confirmUpdateStartup } from '../host/database-backup.mjs'

test('v2 cache survives restart, enforces total cap and never publishes partial files', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'songloft-cache-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  await writeFile(join(directory, 'interrupted.part'), 'incomplete')
  const network = {
    async fetch() {
      return new Response(new Uint8Array([1, 2, 3, 4]), {
        headers: { 'content-length': '4' },
      })
    },
  }
  const cache = new DesktopCache({ directory, network })
  await cache.ready()
  const namespace = JSON.stringify([
    'default',
    'https://music.example/base',
    'user',
  ])
  const request = (id) => ({
    namespace,
    key: JSON.stringify([
      namespace,
      String(id),
      'default',
      'original',
      '0',
      'now',
      'mp3',
    ]),
    task_id: `cache-${id}`,
    url: 'https://music.example/base/media?access_token=secret',
    max_bytes: 5,
    snapshot: {
      id,
      type: 'local',
      title: 'test',
      artist: '',
      album: '',
      duration: 1,
      isVideo: false,
      format: 'mp3',
      updatedAt: 'now',
    },
  })
  const first = await cache.cacheEntry(request(1))
  assert.equal(first.sizeBytes, 4)
  assert.ok(first.url.startsWith('file://'))
  await assert.rejects(cache.cacheEntry(request(2)), /limit_exceeded/)
  assert.equal((await cache.getEntry({ namespace, song_id: 1 })).cached, true)
  assert.equal((await cache.getEntry({ namespace, song_id: 2 })).cached, false)
  assert.ok(!(await readdir(directory)).some((path) => path.endsWith('.part')))
  assert.ok(
    !(await readFile(join(directory, 'index.json'), 'utf8')).includes(
      'access_token',
    ),
  )
  const restarted = new DesktopCache({ directory, network })
  await restarted.ready()
  const listing = await restarted.listEntries({ namespace })
  assert.equal(listing.total, 1)
  assert.equal(listing.bytes, 4)
  await restarted.removeEntry({ namespace, song_id: 1 })
  assert.equal((await restarted.listEntries({ namespace })).total, 0)
  await cache.close()
  await restarted.close()
})

const keys = generateKeyPairSync('ed25519')
const publicKey = keys.publicKey.export({ type: 'spki', format: 'pem' })
const target = {
  channel: 'dev',
  os: 'darwin',
  arch: 'arm64',
  currentVersion: '1.0.0',
  publicKey,
}
const asset = Buffer.from('complete application fixture')
function envelope(patch = {}) {
  const manifest = {
    schema: 1,
    version: '1.0.1',
    channel: 'dev',
    os: 'darwin',
    arch: 'arm64',
    clientSha: 'a'.repeat(40),
    backendSha: 'b'.repeat(40),
    publishedAt: new Date().toISOString(),
    asset: {
      url: 'https://github.com/example/app/releases/download/v1/app.zip',
      kind: 'app-zip',
      size: asset.length,
      sha256: createHash('sha256').update(asset).digest('hex'),
    },
    ...patch,
  }
  const payload = Buffer.from(JSON.stringify(manifest))
  return {
    payload: payload.toString('base64'),
    signature: sign(null, payload, keys.privateKey).toString('base64'),
  }
}
test('independent desktop signatures bind architecture/channel/source commits and reject tampering', () => {
  assert.equal(verifyManifest(envelope(), target).available, true)
  for (const change of [
    { arch: 'x64' },
    { channel: 'stable' },
    { backendSha: 'latest' },
    { asset: { url: 'file:///app' } },
  ])
    assert.throws(() => verifyManifest(envelope(change), target))
  const broken = envelope()
  broken.signature = Buffer.alloc(64).toString('base64')
  assert.throws(() => verifyManifest(broken, target), /signature/)
  assert.throws(
    () => verifyManifest(envelope(), { ...target, os: 'linux' }),
    /target/,
  )
})
test('dev rolling manifests require a newer build and changed source while stable requires a new version', () => {
  const identity = {
    ...target,
    currentClientSha: 'c'.repeat(40),
    currentBuiltAt: '2026-01-01T00:00:00Z',
  }
  assert.equal(
    verifyManifest(envelope({ version: '1.0.0' }), identity).available,
    true,
  )
  assert.equal(
    verifyManifest(envelope({ version: '0.9.0' }), identity).available,
    false,
  )
  assert.equal(
    verifyManifest(
      envelope({ version: '1.0.0', clientSha: 'c'.repeat(40) }),
      identity,
    ).available,
    false,
  )
  assert.equal(
    verifyManifest(
      envelope({ version: '1.0.0', publishedAt: '2025-01-01T00:00:00Z' }),
      identity,
    ).available,
    false,
  )
  assert.equal(
    verifyManifest(envelope({ version: '1.0.0', channel: 'stable' }), {
      ...identity,
      channel: 'stable',
    }).available,
    false,
  )
})
test('downloads verify bytes before readiness and never stop playback automatically', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'songloft-update-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  let stops = 0,
    corrupt = true
  const updater = new DesktopUpdater({
    directory,
    network: {
      request: async () => ({ status: 200, body: JSON.stringify(envelope()) }),
      fetch: async () => new Response(corrupt ? Buffer.from('damaged') : asset),
    },
    identity: { channel: 'dev' },
    currentVersion: '1.0.0',
    publicKey,
    manifestUrl: 'https://example.invalid/desktop.json',
    target: { os: 'darwin', arch: 'arm64' },
    stop: async () => {
      stops++
    },
    backup: async () => assert.fail('backup started with an invalid asset'),
  })
  await updater.check()
  await assert.rejects(updater.download(), /digest_mismatch/)
  assert.equal(updater.state.state, 'error')
  assert.ok(!(await readdir(directory)).some((file) => file.endsWith('.part')))
  corrupt = false
  await updater.download()
  assert.equal(updater.state.state, 'ready')
  assert.equal(stops, 0)
  const signed = JSON.parse(
    await readFile(join(directory, 'manifest.json'), 'utf8'),
  )
  assert.equal(verifyManifest(signed, target).available, true)

  const { sha256 } = verifyManifest(signed, target).asset
  await writeFile(join(directory, `${sha256}.zip`), Buffer.alloc(asset.length))
  await assert.rejects(updater.install(), /update_digest_mismatch/)
  assert.equal(updater.state.state, 'error')
  assert.equal(stops, 0)
  await updater.download()
  assert.equal(updater.state.state, 'ready')
  assert.deepEqual(await readFile(join(directory, `${sha256}.zip`)), asset)
  await updater.close()
})

test('automatic updates resolve the current GitHub proxy before checking and download through it', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'songloft-update-proxy-'))
  const manifestUrl =
    'https://github.com/example/app/releases/download/dev/desktop.json'
  const signed = envelope()
  const manifest = verifyManifest(signed, target)
  const requests = []
  const proxy = 'https://proxy.example/files'
  let configuredProxy = proxy
  let resolutions = 0
  const updater = new DesktopUpdater({
    directory,
    network: {
      request: async ({ url }) => {
        requests.push(url)
        return { status: 200, body: JSON.stringify(signed) }
      },
      fetch: async (url) => {
        requests.push(url)
        return new Response(asset)
      },
    },
    identity: { channel: 'dev' },
    currentVersion: '1.0.0',
    publicKey,
    manifestUrl,
    target: { os: 'darwin', arch: 'arm64' },
    requestProxy: ({ id }) => {
      resolutions++
      updater.resolveProxy({
        id: 'old-request',
        githubProxy: 'https://old.invalid',
      })
      updater.resolveProxy({ id, githubProxy: configuredProxy })
    },
  })
  t.after(async () => {
    await updater.close()
    await rm(directory, { recursive: true, force: true })
  })
  const ready = Promise.withResolvers()
  updater.on('state', (state) => {
    if (state.state === 'ready') ready.resolve()
    if (state.state === 'error') ready.reject(new Error(state.error))
  })
  updater.automatic()
  updater.automatic()
  await ready.promise
  assert.deepEqual(requests, [
    `${proxy}/${manifestUrl}`,
    `${proxy}/${manifest.asset.url}`,
  ])
  assert.equal(resolutions, 1)
  configuredProxy = ''
  // The ready event can precede removal of the temporary download path.
  if ((await updater.check()).state === 'ready') await updater.check()
  assert.deepEqual(requests.slice(2), [manifestUrl])
  assert.equal(resolutions, 2)
})

test('a same-version update waits for the matching app and its local backend', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'songloft-confirm-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const appPath = join(directory, 'Songloft.app')
  const previousApp = join(directory, 'Songloft.previous.app')
  const pending = join(directory, 'pending-startup.json')
  const downloaded = `${createHash('sha256').update(asset).digest('hex')}.zip`
  const otherDownload = `${'c'.repeat(64)}.exe`
  await writeFile(join(directory, downloaded), asset)
  await writeFile(join(directory, otherDownload), 'another release')
  await writeFile(join(directory, 'backup.json'), 'retained library backup')
  const installed = {
    version: '1.0.0',
    clientSha: 'a'.repeat(40),
    backendSha: 'b'.repeat(40),
  }
  await writeFile(previousApp, 'previous app')
  await writeFile(
    pending,
    JSON.stringify({
      ...installed,
      previousApp,
      backup: 'backup.json',
      asset: downloaded,
    }),
  )
  const confirmation = {
    directory,
    appPath,
    ...installed,
    backendRunning: true,
  }
  await assert.rejects(
    confirmUpdateStartup({ ...confirmation, clientSha: 'c'.repeat(40) }),
    /update_startup_identity_mismatch/,
  )
  await assert.rejects(
    confirmUpdateStartup({ ...confirmation, backendSha: 'd'.repeat(40) }),
    /update_startup_identity_mismatch/,
  )
  await confirmUpdateStartup({ ...confirmation, backendRunning: false })
  assert.equal(await readFile(previousApp, 'utf8'), 'previous app')
  assert.deepEqual(await readFile(join(directory, downloaded)), asset)
  const busy = new Error('old archive still busy')
  const cleanupErrors = []
  await confirmUpdateStartup({
    ...confirmation,
    removePrevious: async (path) => {
      assert.equal(path, previousApp)
      assert.equal(
        JSON.parse(
          await readFile(join(directory, 'last-successful-install.json'), 'utf8'),
        ).version,
        installed.version,
      )
      throw busy
    },
    onCleanupError: (error) => cleanupErrors.push(error),
  })
  assert.deepEqual(cleanupErrors, [busy])
  await assert.rejects(readFile(pending), { code: 'ENOENT' })
  await confirmUpdateStartup({ ...confirmation, clientSha: 'c'.repeat(40) })
  assert.equal(await readFile(previousApp, 'utf8'), 'previous app')
  await confirmUpdateStartup(confirmation)
  await confirmUpdateStartup(confirmation)
  assert.deepEqual((await readdir(directory)).sort(), [
    'backup.json',
    otherDownload,
    'last-successful-install.json',
  ])
})

test('a failed database copy discards the incomplete backup and allows retry', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'songloft-backup-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const dataDirectory = join(directory, 'backend')
  await mkdir(dataDirectory)
  const database = join(dataDirectory, 'songloft.db')
  await writeFile(database, 'library data')
  await mkdir(`${database}-wal`)
  const options = {
    dataDirectory,
    directory,
    version: '1.0.0',
    backendSha: 'b'.repeat(40),
  }

  await assert.rejects(backupDatabase(options))
  assert.deepEqual(await readdir(join(directory, 'database-backups')), [])
  assert.equal(await readFile(database, 'utf8'), 'library data')

  await rm(`${database}-wal`, { recursive: true })
  await writeFile(`${database}-wal`, 'remaining WAL')
  const metadata = JSON.parse(
    await readFile(await backupDatabase(options), 'utf8'),
  )
  assert.deepEqual(metadata.files.map(({ name }) => name), [
    'songloft.db',
    'songloft.db-wal',
  ])
})

test('an unresolved update blocks another install before stopping the session', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'songloft-pending-'))
  let stops = 0
  const updater = new DesktopUpdater({
    directory,
    network: {
      request: async () => ({ status: 200, body: JSON.stringify(envelope()) }),
      fetch: async () => new Response(asset),
    },
    identity: { channel: 'dev' },
    currentVersion: '1.0.0',
    publicKey,
    manifestUrl: 'https://example.invalid/desktop.json',
    target: { os: 'darwin', arch: 'arm64' },
    stop: async () => {
      stops++
      throw new Error('unexpected stop')
    },
  })
  t.after(async () => {
    await updater.close()
    await rm(directory, { recursive: true, force: true })
  })
  await updater.check()
  await updater.download()
  await writeFile(join(directory, 'pending-startup.json'), '{}')
  await assert.rejects(updater.install(), /update_startup_pending/)
  assert.equal(stops, 0)
  assert.equal(updater.state.state, 'ready')
})

test('a failing backup releases the session and rejects a concurrent install', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'songloft-update-backup-'))
  const backingUp = Promise.withResolvers()
  const fail = Promise.withResolvers()
  let stops = 0
  let releases = 0
  const updater = new DesktopUpdater({
    directory,
    network: {
      request: async () => ({ status: 200, body: JSON.stringify(envelope()) }),
      fetch: async () => new Response(asset),
    },
    identity: { channel: 'dev' },
    currentVersion: '1.0.0',
    publicKey,
    manifestUrl: 'https://example.invalid/desktop.json',
    target: { os: 'darwin', arch: 'arm64' },
    stop: async () => {
      stops++
      return () => releases++
    },
    backup: async () => {
      backingUp.resolve()
      return fail.promise
    },
  })
  t.after(async () => {
    await updater.close()
    await rm(directory, { recursive: true, force: true })
  })
  await updater.check()
  await updater.download()
  const install = updater.install()
  await backingUp.promise
  await assert.rejects(updater.install(), /update_not_ready/)
  await assert.rejects(updater.download(), /update_install_in_progress/)
  assert.equal((await updater.check()).state, 'installing')
  fail.reject(new Error('test disk failure'))
  await assert.rejects(install, /test disk failure/)
  assert.equal(updater.state.state, 'error')
  assert.equal(stops, 1)
  assert.equal(releases, 1)
})
