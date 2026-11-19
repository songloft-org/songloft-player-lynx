import { createHash } from 'node:crypto'
import { mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { join, resolve } from 'node:path'
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
const list = spawnSync('tar', ['-tf', path], { encoding: 'utf8' })
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
const result = spawnSync('tar', ['-xf', path, '-C', directory], {
  stdio: 'inherit',
})
if (result.status !== 0) throw new Error('SDK extraction failed')
await rm(path)
process.env.SONGLOFT_DESKTOP_SDK_SHA256 = record.manifestSha256
await import('./verify-sdk.mjs')
await import('node:fs/promises').then((fs) =>
  fs.appendFile(
    process.env.GITHUB_ENV,
    `SONGLOFT_DESKTOP_SDK_SHA256=${record.manifestSha256}\n`,
  ),
)
