import { createHash } from 'node:crypto'
import { mkdir, writeFile, readFile, rm, readdir, cp, mkdtemp } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { assertTarget } from '../target.mjs'
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex')
async function download(url, maximum) {
  if (new URL(url).protocol !== 'https:') throw new Error('HTTPS is required')
  const response = await fetch(url, { signal: AbortSignal.timeout(600000) })
  if (!response.ok || new URL(response.url).protocol !== 'https:')
    throw new Error('SDK download rejected')
  const chunks = []
  let size = 0
  for await (const chunk of response.body) {
    size += chunk.length
    if (size > maximum) throw new Error('SDK download too large')
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}
const { SDK_INDEX_URL, SDK_INDEX_SHA256 } = process.env
if (!SDK_INDEX_URL || !/^[a-f0-9]{64}$/.test(SDK_INDEX_SHA256 ?? ''))
  throw new Error('Configure both the desktop SDK index URL and its SHA-256')
const index = await download(SDK_INDEX_URL, 65536)
if (digest(index) !== SDK_INDEX_SHA256)
  throw new Error('SDK index digest rejected')
const target = assertTarget()
if (process.env.DESKTOP_TARGET !== target)
  throw new Error('Runner architecture mismatch')
const record = JSON.parse(index)[target]
if (
  !record ||
  !/^[a-f0-9]{64}$/.test(record.sha256) ||
  !/^[a-f0-9]{64}$/.test(record.manifestSha256)
)
  throw new Error('Missing pinned SDK record')
const archive = await download(record.url, 2 * 1024 ** 3)
if (digest(archive) !== record.sha256)
  throw new Error('SDK archive digest rejected')
const directory = resolve(process.env.SONGLOFT_DESKTOP_SDK)
await mkdir(directory, { recursive: true })
const path = join(directory, 'sdk.tar.gz')
await writeFile(path, archive)
const tarPrefix = process.platform === 'win32' ? ['--force-local'] : []
const list = spawnSync('tar', [...tarPrefix, '-tf', path], {
  encoding: 'utf8',
})
const archivePaths =
  process.platform === 'win32'
    ? list.stdout
        .split(/\r?\n/)
        .map((name) => name.replaceAll('\\', '/'))
    : list.stdout.split(/\r?\n/)
if (
  list.status !== 0 ||
  archivePaths.some(
    (name) =>
      name &&
      (/^(?:\/|[a-z]:)/i.test(name) || name.split('/').includes('..')),
  )
)
  throw new Error('Invalid SDK archive paths')
const result = spawnSync('tar', [...tarPrefix, '-xf', path], {
  cwd: directory,
  stdio: 'inherit',
})
if (result.status !== 0) throw new Error('SDK extraction failed')
await rm(path)

const sdkPath = join(directory, 'sdk.json')
const originalManifest = await readFile(sdkPath)
if (digest(originalManifest) !== record.manifestSha256)
  throw new Error('SDK manifest digest rejected')

// Bundle release jobs may overlay the FFmpeg/ffprobe files resolved from the
// ffmpeg-builder Release. The SDK index remains pinned for libmpv and CEF,
// while the media tools are verified against the same immutable resolution
// used by the rest of the Bundle matrix.
const releaseAsset = process.env.SONGLOFT_FFMPEG_ASSET
const resolutionPath = process.env.SONGLOFT_FFMPEG_RESOLUTION
if (releaseAsset || resolutionPath) {
  if (!releaseAsset || !resolutionPath) throw new Error('FFmpeg release overlay requires both asset and resolution paths')
  const resolution = JSON.parse(await readFile(resolutionPath, 'utf8'))
  const target = process.env.DESKTOP_TARGET === 'win32-x64'
    ? 'windows-x86_64'
    : process.env.DESKTOP_TARGET === 'darwin-arm64'
      ? 'macos-arm64'
      : 'macos-x86_64'
  const assetRecord = resolution.assets?.find((asset) => asset.target === target)
  const expectedAsset = resolve(resolutionPath, '..', assetRecord?.path ?? '')
  if (!assetRecord || expectedAsset !== resolve(releaseAsset)) throw new Error('FFmpeg resolution does not match the desktop target')
  const archive = await readFile(releaseAsset)
  if (archive.length !== assetRecord.size || digest(archive) !== assetRecord.sha256) throw new Error('FFmpeg release asset digest mismatch')
  const staging = await mkdtemp(join(process.env.TMPDIR ?? tmpdir(), 'songloft-ffmpeg-sdk-'))
  const zip = releaseAsset.endsWith('.zip')
  const entries = spawnSync(zip ? 'unzip' : 'tar', zip ? ['-Z1', releaseAsset] : [...tarPrefix, '-tzf', releaseAsset], { encoding: 'utf8' })
  if (entries.status !== 0 || entries.stdout.split(/\r?\n/).some((name) => name && (name.startsWith('/') || /^[A-Za-z]:/.test(name) || name.split('/').includes('..')))) throw new Error('Unsafe FFmpeg release archive')
  const extracted = spawnSync(zip ? 'unzip' : 'tar', zip ? ['-q', releaseAsset, '-d', staging] : [...tarPrefix, '-xzf', releaseAsset, '-C', staging])
  if (extracted.status !== 0) throw new Error('FFmpeg release archive extraction failed')
  const find = async (directory) => {
    const result = []
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const child = join(directory, entry.name)
      if (entry.isDirectory()) result.push(...await find(child))
      else result.push(child)
    }
    return result
  }
  const extension = target.startsWith('windows-') ? '.exe' : ''
  const files = await find(staging)
  await mkdir(join(directory, 'tools'), { recursive: true })
  for (const name of [`ffmpeg${extension}`, `ffprobe${extension}`]) {
    const source = files.find((file) => file.endsWith(`/${name}`) || file.endsWith(`\\${name}`))
    if (!source) throw new Error(`FFmpeg release asset has no ${name}`)
    await cp(source, join(directory, 'tools', name))
  }
  const sdk = JSON.parse(originalManifest)
  sdk.ffmpeg = { version: resolution.ffmpeg_version, commit: resolution.source_commit }
  const toolPaths = new Set([`tools/ffmpeg${extension}`, `tools/ffprobe${extension}`])
  sdk.files = (sdk.files ?? []).filter((file) => !toolPaths.has(file.path))
  for (const name of toolPaths) {
    const file = await readFile(join(directory, name))
    sdk.files.push({ path: name, sha256: digest(file) })
  }
  sdk.files.sort((a, b) => a.path.localeCompare(b.path))
  await writeFile(sdkPath, `${JSON.stringify(sdk, null, 2)}\n`)
  await rm(staging, { recursive: true, force: true })
}
const manifestSha256 = digest(await readFile(sdkPath))
process.env.SONGLOFT_DESKTOP_SDK_SHA256 = manifestSha256
await import('./verify-sdk.mjs')
await import('node:fs/promises').then((fs) =>
  fs.appendFile(
    process.env.GITHUB_ENV,
    `SONGLOFT_DESKTOP_SDK_SHA256=${manifestSha256}\n`,
  ),
)
