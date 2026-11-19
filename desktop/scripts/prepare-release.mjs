import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { copyFile, mkdir, readFile, readdir, stat } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { basename, extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import semver from 'semver'
import { verifyManifest } from '../host/update-manifest.mjs'
import {
  compatibility,
  desktopReleaseAsset,
  desktopReleaseTag,
} from '../target.mjs'

const [channel, clientSha, artifacts, output, previous] = process.argv.slice(2)
const tag = desktopReleaseTag(channel)
if (!/^[a-f0-9]{40}$/.test(clientSha ?? '') || !artifacts || !output)
  throw new Error(
    'Expected channel, full client SHA, artifact directory and output',
  )

const assets = join(output, 'assets')
const manifests = join(output, 'manifests')
const signer = fileURLToPath(new URL('./sign-update.mjs', import.meta.url))
const packages = []
let identity

for (const target of compatibility.targets) {
  const artifact = join(artifacts, `${tag}-${target}`)
  const infoPath = join(artifact, 'resources', target, 'build-info.json')
  const info = JSON.parse(await readFile(infoPath, 'utf8'))
  const manifestName = `desktop-${target}.json`
  if (
    info.schema !== 1 ||
    info.channel !== channel ||
    info.target !== target ||
    info.dirty !== false ||
    info.clientSha !== clientSha ||
    !/^[a-f0-9]{64}$/.test(info.clientSourceSha256) ||
    info.backendSha !== info.backendPinnedSha ||
    !/^[a-f0-9]{40}$/.test(info.backendSha) ||
    typeof info.backendVersion !== 'string' ||
    semver.valid(info.backendVersion) !== info.backendVersion ||
    semver.valid(info.version) !== info.version ||
    (channel === 'stable' && semver.prerelease(info.version)) ||
    info.updateManifest !== desktopReleaseAsset(channel, manifestName)
  )
    throw new Error(`Build metadata rejected for ${target}`)

  const current = JSON.stringify([
    info.clientSourceSha256,
    info.backendSha,
    info.backendVersion,
    info.version,
    info.updatePublicKey,
  ])
  identity ??= current
  if (current !== identity)
    throw new Error(
      'Desktop targets must use the same client source, client version, backend identity and update key',
    )

  packages.push({ target, artifact, infoPath, info, manifestName })
}

await mkdir(assets, { recursive: true })
await mkdir(manifests, { recursive: true })

for (const { target, artifact, infoPath, info, manifestName } of packages) {
  const [os, arch] = target.split('-')
  const directory = join(artifact, 'release', channel, target)
  const files = await readdir(directory, { withFileTypes: true })
  const extensions = os === 'darwin' ? ['.zip', '.dmg'] : ['.exe']
  let updateAsset
  for (const extension of extensions) {
    const matches = files.filter(
      (file) => file.isFile() && extname(file.name).toLowerCase() === extension,
    )
    if (matches.length !== 1)
      throw new Error(`Expected one ${extension} package for ${target}`)
    const source = join(directory, matches[0].name)
    const { size } = await stat(source)
    if (size < 1 || size >= 2 * 1024 ** 3)
      throw new Error('Invalid GitHub asset size')
    const hash = createHash('sha256')
    for await (const data of createReadStream(source)) hash.update(data)
    const name = `songloft-lynx-${channel}-${info.version}-${target}-${hash.digest('hex').slice(0, 16)}${extension}`
    const staged = join(assets, name)
    await copyFile(source, staged)
    if (extension !== '.dmg') updateAsset = staged
  }

  const manifest = join(manifests, manifestName)
  const result = spawnSync(
    process.execPath,
    [
      signer,
      infoPath,
      updateAsset,
      desktopReleaseAsset(channel, basename(updateAsset)),
      manifest,
    ],
    { stdio: 'inherit' },
  )
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`Could not sign ${target}`)

  const options = {
    publicKey: info.updatePublicKey,
    channel,
    os,
    arch,
    currentVersion: '0.0.0',
  }
  const next = verifyManifest(
    JSON.parse(await readFile(manifest, 'utf8')),
    options,
  )
  if (!previous) continue
  const old = await readFile(join(previous, manifestName), 'utf8').catch(
    (error) => {
      if (error.code === 'ENOENT') return null
      throw error
    },
  )
  if (!old) continue
  const published = verifyManifest(JSON.parse(old), options)
  if (published.manifestSha256 === next.manifestSha256) continue
  if (
    (channel === 'stable' && !semver.gt(next.version, published.version)) ||
    (channel === 'dev' &&
      (semver.lt(next.version, published.version) ||
        Date.parse(next.publishedAt) <= Date.parse(published.publishedAt)))
  )
    throw new Error(
      `Refusing to replace a newer or unchanged ${target} release`,
    )
}
