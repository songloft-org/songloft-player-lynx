import { spawnSync } from 'node:child_process'
import { createHash, createPublicKey } from 'node:crypto'
import {
  mkdir,
  readFile,
  writeFile,
  chmod,
  cp,
  rename,
  rm,
  mkdtemp,
  lstat,
  readdir,
} from 'node:fs/promises'
import { join, resolve, dirname, basename } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import semver from 'semver'
import {
  assertTarget,
  compatibility,
  desktopUpdateManifestUrl,
} from '../target.mjs'
import { desktopIdentity } from '../host/identity.mjs'
import { clientSourceState } from './source-state.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const client = dirname(root)
const backend = resolve(
  process.env.SONGLOFT_BACKEND_SOURCE ?? join(client, '..', '..'),
)
const arch = process.argv.includes('--x64')
  ? 'x64'
  : process.argv.includes('--arm64')
    ? 'arm64'
    : process.arch
const target = assertTarget(process.platform, arch)
const channel = process.env.SONGLOFT_DESKTOP_CHANNEL ?? 'dev'
const variant = process.env.SONGLOFT_DESKTOP_VARIANT ?? 'bundled'
if (!['standard', 'bundled'].includes(variant))
  throw new Error('Invalid desktop package variant')
const identity = desktopIdentity({ channel, appData: '/' })
const development = process.env.SONGLOFT_DESKTOP_ALLOW_DIRTY === '1'
if (development && channel !== 'dev')
  throw new Error('Dirty builds are development-only')
const clientState = await clientSourceState(client)
const bundleBuild = JSON.parse(
  await readFile(join(client, 'dist', 'desktop-build.json'), 'utf8'),
)
const bundleSha256 = createHash('sha256')
  .update(await readFile(join(client, 'dist', 'main.lynx.bundle')))
  .digest('hex')
if (
  bundleBuild.schema !== 1 ||
  bundleBuild.bundleSha256 !== bundleSha256 ||
  !/^[a-f0-9]{40}$/.test(bundleBuild.clientSha) ||
  !/^[a-f0-9]{64}$/.test(bundleBuild.sourceSha256)
)
  throw new Error('Desktop bundle build identity rejected; run desktop:build')
if (
  !development &&
  (clientState.dirty ||
    bundleBuild.dirty ||
    bundleBuild.clientSha !== clientState.clientSha ||
    bundleBuild.sourceSha256 !== clientState.sourceSha256)
)
  throw new Error(
    'Release requires a clean client and a bundle built from exactly that source',
  )
const version =
  process.env.SONGLOFT_DESKTOP_VERSION ??
  JSON.parse(await readFile(join(client, 'package.json'), 'utf8')).version
if (!semver.valid(version)) throw new Error('Invalid desktop version')
const sdk = resolve(process.env.SONGLOFT_DESKTOP_SDK ?? '')
if (!process.env.SONGLOFT_DESKTOP_SDK)
  throw new Error(
    'SONGLOFT_DESKTOP_SDK must point to the verified per-target SDK',
  )
const sdkRaw = await readFile(join(sdk, 'sdk.json'))
const sdkHash = createHash('sha256').update(sdkRaw).digest('hex')
if (!development && sdkHash !== process.env.SONGLOFT_DESKTOP_SDK_SHA256)
  throw new Error('SDK manifest digest is required for release builds')
const sdkInfo = JSON.parse(sdkRaw)
if (
  sdkInfo.target !== target ||
  sdkInfo.mpv?.version !== compatibility.libmpv.version ||
  sdkInfo.mpv?.commit !== compatibility.libmpv.sourceCommit ||
  sdkInfo.ffmpeg?.version !== '8.0.1' ||
  sdkInfo.ffmpeg?.commit !== compatibility.ffmpegCommit ||
  !Array.isArray(sdkInfo.files)
)
  throw new Error('Incompatible desktop SDK')
const run = (command, args, cwd, options = {}) => {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    ...options,
  })
  if (result.error) throw result.error
  if (result.status !== 0)
    throw new Error(`${command} failed: ${result.stderr ?? ''}`)
  return result.stdout
}
const tarPrefix = process.platform === 'win32' ? ['--force-local'] : []
const backendSha = run('git', ['rev-parse', 'HEAD'], backend).trim()
const selectedBackendSha = process.env.SONGLOFT_BACKEND_COMMIT ?? backendSha
if (!/^[a-f0-9]{40}$/.test(backendSha) || backendSha !== selectedBackendSha)
  throw new Error(
    'Backend checkout does not match the commit selected for this build',
  )
const backendMain = run('git', ['show', `${backendSha}:main.go`], backend)
const backendVersion = development
  ? 'dev'
  : /^\/\/ @version (\d+\.\d+\.\d+)$/m.exec(backendMain)?.[1]
if (
  !development &&
  (!backendVersion || semver.valid(backendVersion) !== backendVersion)
)
  throw new Error(`Invalid version in backend commit ${backendSha}`)
const builtAt = new Date().toISOString()
const snapshot = await mkdtemp(join(tmpdir(), 'songloft-desktop-backend-'))
const resources = join(root, 'resources')
const destination = join(resources, target)
let staging
async function sourceFingerprint(directory) {
  const digest = createHash('sha256')
  async function walk(path = '') {
    const entries = await readdir(join(directory, path), {
      withFileTypes: true,
    })
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const child = join(path, entry.name)
      if (entry.isDirectory()) await walk(child)
      else if (entry.isFile())
        digest
          .update(child)
          .update('\0')
          .update(await readFile(join(directory, child)))
          .update('\0')
    }
  }
  await walk()
  return digest.digest('hex')
}
try {
  // Archive the exact backend commit, then overlay a fingerprinted working tree
  // only for explicitly requested development builds.
  const archive = spawnSync('git', ['archive', backendSha], {
    cwd: backend,
    maxBuffer: 128 * 1024 * 1024,
  })
  if (archive.status !== 0)
    throw new Error('Selected backend commit is unavailable')
  run('tar', [...tarPrefix, '-xf', '-'], snapshot, {
    input: archive.stdout,
  })
  const backendSubmodules = {}
  // git archive omits gitlinks. The Go replace directive requires this pinned
  // nested module, independently of optional client/plugin checkouts.
  for (const path of ['pkg/tag']) {
    const entry = run('git', ['ls-tree', backendSha, '--', path], backend)
    const sha = /^160000 commit ([a-f0-9]{40})\t/.exec(entry)?.[1]
    if (!sha) throw new Error('Backend Go module gitlink is missing')
    const nested = spawnSync('git', ['archive', sha], {
      cwd: join(backend, path),
      maxBuffer: 64 * 1024 * 1024,
    })
    if (nested.status !== 0)
      throw new Error(
        'Initialize pinned backend pkg/tag before building resources',
      )
    await mkdir(join(snapshot, path), { recursive: true })
    run('tar', [...tarPrefix, '-xf', '-'], join(snapshot, path), {
      input: nested.stdout,
    })
    backendSubmodules[path] = sha
  }
  if (development) {
    const tracked = run('git', ['ls-files', '-z'], backend).split('\0')
    const untracked = run(
      'git',
      ['ls-files', '--others', '--exclude-standard', '-z'],
      backend,
    ).split('\0')
    for (const path of new Set([...tracked, ...untracked])) {
      if (
        !path ||
        !/^(?:main\.go|go\.(?:mod|sum)|internal\/|pkg\/|cmd\/)/.test(path)
      )
        continue
      const info = await lstat(join(backend, path)).catch(() => null)
      if (!info) {
        await rm(join(snapshot, path), { force: true })
        continue
      }
      if (!info.isFile()) continue
      await mkdir(dirname(join(snapshot, path)), { recursive: true })
      await cp(join(backend, path), join(snapshot, path))
    }
  }
  if (
    !(
      await readFile(join(snapshot, 'internal', 'app', 'app.go'), 'utf8')
    ).includes('parent-watch-stdin')
  )
    throw new Error('Selected backend commit lacks parent-watch-stdin.')
  const sourceDigest = await sourceFingerprint(snapshot)
  await mkdir(resources, { recursive: true })
  staging = await mkdtemp(join(resources, `.${target}-`))
  for (const file of sdkInfo.files) {
    if (
      typeof file.path !== 'string' ||
      !/^(?:native\/lib|tools)\/[A-Za-z0-9._+-]+$/.test(file.path) ||
      !/^[a-f0-9]{64}$/.test(file.sha256)
    )
      throw new Error('Invalid SDK file record')
    const source = join(sdk, file.path)
    if (
      !(await lstat(source)).isFile() ||
      createHash('sha256')
        .update(await readFile(source))
        .digest('hex') !== file.sha256
    )
      throw new Error('SDK file digest mismatch')
    const resourcePath =
      process.platform === 'win32'
        ? file.path.replace(/^native\/lib\//, 'native/')
        : file.path
    await mkdir(dirname(join(staging, resourcePath)), { recursive: true })
    await cp(source, join(staging, resourcePath))
  }
  for (const name of ['ffmpeg', 'ffprobe'])
    await lstat(
      join(
        staging,
        'tools',
        name + (process.platform === 'win32' ? '.exe' : ''),
      ),
    )
  await mkdir(join(staging, 'native'), { recursive: true })
  await cp(
    join(root, '.build', target, 'songloft_mpv.node'),
    join(staging, 'native', 'songloft_mpv.node'),
  )
  const goEnv = {
    ...process.env,
    GOOS: process.platform === 'win32' ? 'windows' : 'darwin',
    GOARCH: arch === 'x64' ? 'amd64' : 'arm64',
    CGO_ENABLED: '0',
  }
  const extension = process.platform === 'win32' ? '.exe' : ''
  await mkdir(join(staging, 'backend'), { recursive: true })
  run(
    'go',
    [
      'build',
      '-trimpath',
      '-tags',
      'lite',
      '-ldflags',
      [
        `-X songloft/internal/version.Version=${backendVersion}`,
        `-X songloft/internal/version.GitCommit=${backendSha}`,
        `-X songloft/internal/version.BuildTime=${builtAt}`,
        '-X songloft/internal/version.BuildType=lite',
      ].join(' '),
      '-o',
      join(staging, 'backend', `songloft${extension}`),
      '.',
    ],
    snapshot,
    { env: goEnv },
  )
  const publicKeyPath = process.env.SONGLOFT_DESKTOP_UPDATE_PUBLIC_KEY
  if (!publicKeyPath)
    throw new Error(
      'An independent desktop update public key is required, including test-signed development packages',
    )
  const updatePublicKey = await readFile(publicKeyPath, 'utf8')
  if (createPublicKey(updatePublicKey).asymmetricKeyType !== 'ed25519')
    throw new Error('Desktop update key must be Ed25519')
  const flags = `-s -w -X main.publicKeyBase64=${Buffer.from(updatePublicKey).toString('base64')} -X main.windowsExecutable=${channel === 'dev' ? 'SongloftDev.exe' : 'Songloft.exe'}`
  await mkdir(join(staging, 'updater'), { recursive: true })
  run(
    'go',
    [
      'build',
      '-trimpath',
      '-ldflags',
      flags,
      '-o',
      join(staging, 'updater', `songloft-update${extension}`),
      '.',
    ],
    join(root, 'updater'),
    { env: goEnv },
  )
  if (process.platform === 'darwin') {
    const baseline = semver.coerce(compatibility.minimumOS.darwin)
    const libraries = new Set(
      sdkInfo.files
        .filter((file) => file.path.startsWith('native/lib/'))
        .map((file) => file.path.split('/').at(-1)),
    )
    const binaries = [
      'native/songloft_mpv.node',
      ...sdkInfo.files.map((file) => file.path),
      `backend/songloft`,
      `updater/songloft-update`,
    ]
    for (const relative of binaries) {
      const path = join(staging, relative)
      const dependencies = run('otool', ['-L', path], root).split('\n').slice(1)
      for (const line of dependencies) {
        const dependency = /^\s*(.*?) \((?:compatibility|current) version/.exec(
          line,
        )?.[1]
        if (
          !dependency ||
          dependency.startsWith('/usr/lib/') ||
          dependency.startsWith('/System/Library/')
        )
          continue
        const name = dependency.split('/').at(-1)
        if (name === basename(path)) continue
        // The first record of a dylib is its own install ID.
        if (relative.endsWith('.dylib') && name === relative.split('/').at(-1))
          continue
        if (!libraries.has(name))
          throw new Error(`Missing bundled dynamic library: ${name}`)
        const prefix = relative.startsWith('native/lib/')
          ? '@loader_path/'
          : relative.startsWith('native/')
            ? '@loader_path/lib/'
            : '@loader_path/../native/lib/'
        run(
          'install_name_tool',
          ['-change', dependency, `${prefix}${name}`, path],
          root,
        )
      }
      if (relative.endsWith('.dylib'))
        run(
          'install_name_tool',
          ['-id', `@rpath/${relative.split('/').at(-1)}`, path],
          root,
        )
      const loadCommands = run('otool', ['-l', path], root)
      const versions = [
        ...loadCommands.matchAll(/^\s*minos ([\d.]+)\s*$/gm),
        ...loadCommands.matchAll(
          /^\s*cmd LC_VERSION_MIN_MACOSX\n\s*cmdsize \d+\n\s*version ([\d.]+)/gm,
        ),
      ]
      for (const [, version] of versions) {
        if (semver.gt(semver.coerce(version), baseline))
          throw new Error(
            `${relative} requires macOS ${version}, above the supported baseline`,
          )
      }
      for (const match of loadCommands.matchAll(
        /cmd LC_RPATH\n[^\n]*\n\s*path (.*?) \(offset/g,
      ))
        run('install_name_tool', ['-delete_rpath', match[1], path], root)
      run('codesign', ['--force', '--sign', '-', path], root)
    }
  }
  const manifest = desktopUpdateManifestUrl(channel, target, variant)
  await writeFile(
    join(staging, 'build-info.json'),
    JSON.stringify(
      {
        schema: 1,
        appId: identity.id,
        variant,
        channel,
        target,
        version,
        clientSha: bundleBuild.clientSha,
        clientSourceSha256: bundleBuild.sourceSha256,
        bundleSha256,
        backendVersion,
        backendSha,
        backendPinnedSha: selectedBackendSha,
        backendSubmodules,
        dirty: development,
        backendDirtySha256: development ? sourceDigest : null,
        sdkSha256: sdkHash,
        updateManifest: manifest,
        updatePublicKey,
        builtAt,
      },
      null,
      2,
    ),
  )
  await chmod(staging, 0o777 & ~process.umask())
  await rm(destination, { recursive: true, force: true })
  await rename(staging, destination)
  console.log(`Prepared complete desktop resources: ${target} (${channel})`)
} finally {
  await rm(snapshot, { recursive: true, force: true })
  if (staging) await rm(staging, { recursive: true, force: true })
}
