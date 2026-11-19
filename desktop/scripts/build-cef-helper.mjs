import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream, existsSync } from 'node:fs'
import { mkdir, mkdtemp, rename, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { compatibility } from '../target.mjs'

const platforms = {
  'darwin-arm64': 'macosarm64',
  'darwin-x64': 'macosx64',
  'win32-x64': 'windows64',
}

export async function buildCefHelper(root, target) {
  const platform = platforms[target]
  const cef = compatibility.cef
  const directory = join(root, '.build', 'cef-sdk')
  const name = `cef_binary_${cef.sdkVersion}_${platform}_minimal`
  const archive = join(directory, `${name}.tar.bz2`)
  const sdk = join(directory, name)
  const build = join(root, '.build', `${target}-cef-helper`)
  const windows = target === 'win32-x64'
  const expected = cef.minimalSdkSha256[platform]
  const cmakePath = (value) =>
    process.platform === 'win32' ? value.replaceAll('\\', '/') : value
  const run = (command, args, cwd = root) => {
    const result = spawnSync(command, args, { cwd, stdio: 'inherit' })
    if (result.error) throw result.error
    if (result.status !== 0)
      throw new Error(`${command} failed to build the CEF helper`)
  }

  await mkdir(directory, { recursive: true })
  if (!existsSync(archive)) {
    const url = `https://cef-builds.spotifycdn.com/${encodeURIComponent(name)}.tar.bz2`
    const response = await fetch(url, { signal: AbortSignal.timeout(600000) })
    if (
      !response.ok ||
      new URL(response.url).protocol !== 'https:' ||
      !response.body
    )
      throw new Error('CEF SDK download failed')
    const pending = `${archive}.part`
    const hash = createHash('sha256')
    let size = 0
    const measure = new Transform({
      transform(chunk, _encoding, write) {
        size += chunk.length
        if (size > 200 * 1024 ** 2)
          return write(new Error('CEF SDK exceeds the download limit'))
        hash.update(chunk)
        write(null, chunk)
      },
    })
    try {
      await pipeline(
        Readable.fromWeb(response.body),
        measure,
        createWriteStream(pending),
      )
      if (hash.digest('hex') !== expected)
        throw new Error('CEF SDK digest mismatch')
      await rename(pending, archive)
    } finally {
      await rm(pending, { force: true })
    }
  }
  if (!existsSync(join(sdk, 'include', 'cef_version.h'))) {
    const hash = createHash('sha256')
    for await (const chunk of createReadStream(archive)) hash.update(chunk)
    if (hash.digest('hex') !== expected)
      throw new Error('CEF SDK digest mismatch')
    const extraction = await mkdtemp(join(directory, 'extract-'))
    try {
      run(
        'tar',
        [
          ...(windows ? ['--force-local'] : []),
          '-xf',
          archive,
        ],
        extraction,
      )
      await rename(join(extraction, name), sdk)
    } finally {
      await rm(extraction, { recursive: true, force: true })
    }
  }

  const machine = target === 'darwin-arm64' ? 'arm64' : 'x86_64'
  run('cmake', [
    '-S',
    cmakePath(join(root, 'cef-helper')),
    '-B',
    cmakePath(build),
    `-DCEF_ROOT=${cmakePath(sdk)}`,
    '-DCMAKE_BUILD_TYPE=Release',
    ...(windows
      ? ['-A', 'x64', '-DPROJECT_ARCH=x86_64']
      : [
          `-DPROJECT_ARCH=${machine}`,
          `-DCMAKE_OSX_ARCHITECTURES=${machine}`,
          '-DCMAKE_OSX_DEPLOYMENT_TARGET=13.0',
        ]),
  ])
  run('cmake', ['--build', build, '--config', 'Release', '--parallel', '8'])
  return {
    executable: join(
      build,
      windows ? 'songloft_cef_helper.exe' : 'songloft_cef_helper',
    ),
    license: join(sdk, 'LICENSE.txt'),
  }
}
