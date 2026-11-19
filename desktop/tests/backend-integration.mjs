// Real packaged backend lifecycle, scan, persistence and streaming check. Music
// fixtures must live outside temporary directories, per backend scan rules.
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { delimiter, resolve, join } from 'node:path'
import { mkdtemp, readFile, rm, utimes } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { parseArgs } from 'node:util'
import { DesktopBackend } from '../host/backend.mjs'
import { compatibility } from '../target.mjs'

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: { 'build-info': { type: 'string' } },
})
const [executable, toolsDirectory, suppliedMusic] = positionals.map((path) =>
  resolve(path),
)
assert.ok(executable && toolsDirectory, 'backend and tools paths required')
if (values['build-info']) {
  const info = JSON.parse(await readFile(values['build-info'], 'utf8'))
  assert.ok(info.backendVersion, 'missing packaged backend version')
  assert.match(info.backendSha, /^[a-f0-9]{40}$/)
  const output = execFileSync(executable, ['-version'], {
    encoding: 'utf8',
    timeout: 10000,
    windowsHide: true,
  })
  assert.deepEqual(output.trim().split(/\r?\n/), [
    `Songloft Version: ${info.backendVersion}`,
    `Git Commit: ${info.backendSha}`,
    `Build Time: ${info.builtAt}`,
    'Build Type: lite',
  ])
}
const dataDirectory = await mkdtemp(
  join(tmpdir(), 'songloft-backend-integration-'),
)
const credentials = {
  username: 'admin',
  password: randomBytes(32).toString('hex'),
}
const backend = new DesktopBackend({
  executable,
  toolsDirectory,
  dataDirectory,
  credentials: async () => credentials,
})
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
let address, token
async function request(path, method = 'GET', body) {
  const result = await fetch(`${address}/api/v1${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(10000),
  })
  assert.ok(result.ok, `${path}: HTTP ${result.status}`)
  return result.json()
}
async function login() {
  token = (await request('/auth/login', 'POST', credentials)).access_token
  assert.ok(token)
}
let fixture
try {
  if (!suppliedMusic) {
    // Use the distributed tools to make and inspect a real song. The library
    // intentionally lives outside the backend's temporary directory.
    fixture = await mkdtemp(join(homedir(), 'Songloft bundle test '))
    const extension = process.platform === 'win32' ? '.exe' : ''
    const tool = (name, args) =>
      execFileSync(join(toolsDirectory, name + extension), args, {
        encoding: 'utf8',
        // A freshly packaged FFmpeg can take over 30 seconds on its first launch.
        timeout: 120_000,
        windowsHide: true,
        env: {
          ...process.env,
          PATH: [join(toolsDirectory, '..', 'native'), process.env.PATH].join(
            delimiter,
          ),
        },
      })
    for (const name of ['ffmpeg', 'ffprobe']) {
      const version = tool(name, ['-version']).split(/\s+/)[2]
      assert.equal(
        version?.replace(/^n/, '').split('-')[0],
        compatibility.ffmpeg,
        `packaged ${name} version`,
      )
    }
    const song = join(fixture, '测试歌曲 with spaces.flac')
    tool('ffmpeg', [
      '-loglevel',
      'error',
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=440:duration=3',
      '-c:a',
      'flac',
      song,
    ])
    const media = JSON.parse(
      tool('ffprobe', ['-v', 'error', '-show_streams', '-of', 'json', song]),
    )
    assert.ok(media.streams.some((stream) => stream.codec_name === 'flac'))
    // The scanner ignores files that still appear to be written.
    const settled = new Date(Date.now() - 60_000)
    await utimes(song, settled, settled)
  }
  const musicDirectory = suppliedMusic ?? fixture
  address = (await backend.start(musicDirectory)).address
  await login()
  await request('/scan', 'POST', {})
  const deadline = Date.now() + 45000
  let progress
  do {
    await delay(100)
    progress = await request('/scan/progress')
  } while (
    !['completed', 'failed', 'cancelled'].includes(progress.status) &&
    Date.now() < deadline
  )
  assert.equal(progress.status, 'completed')
  const before = await request('/songs?page=1&page_size=20')
  assert.ok(before.songs?.length > 0, 'scan must persist a real fixture')
  const song = before.songs[0]
  const stream = await fetch(`${address}/api/v1/songs/${song.id}/play`, {
    headers: { Authorization: `Bearer ${token}`, Range: 'bytes=0-1023' },
    signal: AbortSignal.timeout(10000),
  })
  assert.equal(stream.status, 206)
  assert.ok((await stream.arrayBuffer()).byteLength > 0)
  await backend.stop()
  assert.equal(backend.state.state, 'stopped')
  address = (await backend.start(musicDirectory)).address
  token = null
  await login()
  const after = await request('/songs?page=1&page_size=20')
  assert.deepEqual(
    after.songs.map((item) => item.id),
    before.songs.map((item) => item.id),
  )
  await backend.stop()
  assert.equal(backend.state.state, 'stopped')
  console.log(
    JSON.stringify({
      result: 'pass',
      scanned: before.songs.length,
      persisted: after.songs.length,
      rangeStatus: stream.status,
      backendStopped: true,
    }),
  )
} finally {
  await backend.stop()
  await rm(dataDirectory, { recursive: true, force: true })
  if (fixture) await rm(fixture, { recursive: true, force: true })
}
