import { spawnSync } from 'node:child_process'
import {
  mkdir,
  cp,
  readFile,
  writeFile,
  readdir,
  realpath,
} from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { basename, dirname, join, resolve } from 'node:path'
import { assertTarget, compatibility } from '../target.mjs'

// Prepare an inspectable SDK from explicitly supplied, pinned mpv/FFmpeg
// installations. It never downloads a mutable "latest" native dependency.
const target = assertTarget()
const destination = process.env.SONGLOFT_DESKTOP_SDK
const mpv = process.env.SONGLOFT_MPV_ROOT
const ffmpeg = process.env.SONGLOFT_FFMPEG_ROOT
const commit = process.env.SONGLOFT_FFMPEG_COMMIT
if (!destination || !mpv || !ffmpeg || !/^[a-f0-9]{40}$/.test(commit ?? ''))
  throw new Error(
    'Set SONGLOFT_DESKTOP_SDK, SONGLOFT_MPV_ROOT, SONGLOFT_FFMPEG_ROOT and SONGLOFT_FFMPEG_COMMIT',
  )
if (commit !== compatibility.ffmpegCommit)
  throw new Error('FFmpeg source commit must match compatibility.json')
const allowed = await Promise.all(
  [
    mpv,
    ffmpeg,
    ...(process.env.SONGLOFT_SDK_LIBRARY_DIRS ?? '')
      .split(process.platform === 'win32' ? ';' : ':')
      .filter(Boolean),
  ].map((path) => realpath(resolve(path))),
)
const output = resolve(destination)
if (
  allowed.some(
    (path) =>
      output === path ||
      path.startsWith(`${output}/`) ||
      output.startsWith(`${path}/`),
  )
)
  throw new Error('SDK output must be separate from its inputs')
const execute = (command, args) => {
  const result = spawnSync(command, args, { encoding: 'utf8' })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`${command} failed`)
  return result.stdout
}
const extension = process.platform === 'win32' ? '.exe' : ''
for (const name of ['ffmpeg', 'ffprobe'])
  if (
    !new RegExp(`^${name} version (?:n)?8\\.0\\.1(?:[ -]|$)`).test(
      execute(join(ffmpeg, 'bin', `${name}${extension}`), ['-version']),
    )
  )
    throw new Error('Expected FFmpeg/ffprobe 8.0.1')
const sources = new Map()
const search = [
  ...new Set(
    allowed.flatMap((path) => [path, join(path, 'lib'), join(path, 'bin')]),
  ),
]
const system = (path) =>
  path.startsWith('/usr/lib/') || path.startsWith('/System/Library/')
async function findLibrary(dependency, from) {
  if (process.platform === 'darwin') {
    if (system(dependency)) return null
    let candidate = dependency.replace('@loader_path', dirname(from))
    if (candidate.startsWith('@rpath/')) {
      const commands = execute('otool', ['-l', from])
      const rpaths = [
        ...commands.matchAll(/cmd LC_RPATH\n[^\n]*\n\s*path (.*?) \(offset/g),
      ].map((match) => match[1].replace('@loader_path', dirname(from)))
      for (const path of [...rpaths, ...search]) {
        try {
          return await realpath(join(path, dependency.slice(7)))
        } catch {}
      }
    }
    try {
      return await realpath(candidate)
    } catch {}
  } else {
    for (const path of [dirname(from), ...search]) {
      const name = (await readdir(path).catch(() => [])).find(
        (name) => name.toLowerCase() === dependency.toLowerCase(),
      )
      if (name) return realpath(join(path, name))
    }
    if (!/^(?:vcruntime|msvcp|concrt)/i.test(dependency)) {
      if (/^api-ms-win-|^ext-ms-win-/i.test(dependency)) return null
      try {
        await realpath(join(process.env.SystemRoot, 'System32', dependency))
        return null
      } catch {}
    }
  }
  throw new Error(`Missing SDK dependency: ${basename(dependency)}`)
}
async function add(source, path) {
  const actual = await realpath(source)
  if (
    !allowed.some(
      (root) =>
        actual === root ||
        actual.startsWith(`${root}/`) ||
        actual.startsWith(`${root}\\`),
    )
  )
    throw new Error('Dynamic dependency is outside the declared SDK roots')
  if (sources.has(path)) {
    if (
      !Buffer.from(await readFile(sources.get(path))).equals(
        await readFile(actual),
      )
    )
      throw new Error('Conflicting SDK library basenames')
    return
  }
  sources.set(path, actual)
  const dependencies =
    process.platform === 'darwin'
      ? execute('otool', ['-L', actual])
          .split('\n')
          .slice(1)
          .map(
            (line) =>
              /^\s*(.*?) \((?:compatibility|current) version/.exec(line)?.[1],
          )
          .filter(Boolean)
      : execute('dumpbin', ['/DEPENDENTS', actual])
          .split('\n')
          .map((line) => /^\s+([A-Za-z0-9_.+-]+\.dll)\s*$/i.exec(line)?.[1])
          .filter(Boolean)
  for (const dependency of dependencies) {
    if (
      process.platform === 'darwin' &&
      basename(dependency) === basename(actual)
    )
      continue
    const library = await findLibrary(dependency, actual)
    if (library) await add(library, `native/lib/${basename(dependency)}`)
  }
}
let mpvLibrary
for (const directory of [join(mpv, 'lib'), join(mpv, 'bin')]) {
  for (const name of await readdir(directory).catch(() => []))
    if (
      process.platform === 'darwin'
        ? /^libmpv\.2\.dylib$/.test(name)
        : /^(?:lib)?mpv-2\.dll$/i.test(name)
    )
      mpvLibrary = join(directory, name)
}
if (!mpvLibrary) throw new Error('libmpv shared library missing')
await add(mpvLibrary, `native/lib/${basename(mpvLibrary)}`)
for (const name of ['ffmpeg', 'ffprobe'])
  await add(
    join(ffmpeg, 'bin', `${name}${extension}`),
    `tools/${name}${extension}`,
  )
await mkdir(output, { recursive: true })
// Build-only headers/import libraries are included separately from distributable
// files. A CI job can build the addon without access to the original machine.
await cp(join(mpv, 'include', 'mpv'), join(output, 'build', 'include', 'mpv'), {
  recursive: true,
})
await mkdir(join(output, 'build', 'lib'), { recursive: true })
if (process.platform === 'darwin')
  await cp(mpvLibrary, join(output, 'build', 'lib', 'libmpv.dylib'))
else {
  let found = false
  for (const name of ['mpv.lib', 'mpv-2.lib', 'libmpv.lib']) {
    try {
      await cp(join(mpv, 'lib', name), join(output, 'build', 'lib', name))
      found = true
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
    }
  }
  if (!found) throw new Error('MSVC libmpv import library is required')
}
const files = []
for (const [path, source] of sources) {
  await mkdir(dirname(join(output, path)), { recursive: true })
  await cp(source, join(output, path))
  files.push({ path })
}
if (process.platform === 'darwin') {
  const names = new Set(
    [...sources.keys()]
      .filter((path) => path.startsWith('native/lib/'))
      .map((path) => basename(path)),
  )
  for (const path of sources.keys()) {
    const file = join(output, path)
    for (const line of execute('otool', ['-L', file]).split('\n').slice(1)) {
      const dependency = /^\s*(.*?) \((?:compatibility|current) version/.exec(
        line,
      )?.[1]
      if (!dependency || system(dependency)) continue
      const name = basename(dependency)
      if (!names.has(name)) throw new Error('Unstaged dynamic dependency')
      execute('install_name_tool', [
        '-change',
        dependency,
        `${path.startsWith('tools/') ? '@loader_path/../native/lib/' : '@loader_path/'}${name}`,
        file,
      ])
    }
    if (path.endsWith('.dylib'))
      execute('install_name_tool', ['-id', `@rpath/${basename(path)}`, file])
    for (const match of execute('otool', ['-l', file]).matchAll(
      /cmd LC_RPATH\n[^\n]*\n\s*path (.*?) \(offset/g,
    ))
      execute('install_name_tool', ['-delete_rpath', match[1], file])
    execute('codesign', ['--force', '--sign', '-', file])
    if (path.startsWith('native/lib/'))
      await cp(file, join(output, 'build', 'lib', basename(path)))
  }
  await cp(
    join(output, 'build', 'lib', basename(mpvLibrary)),
    join(output, 'build', 'lib', 'libmpv.dylib'),
  )
}
for (const file of files)
  file.sha256 = createHash('sha256')
    .update(await readFile(join(output, file.path)))
    .digest('hex')
const buildFiles = []
async function inventory(path) {
  for (const entry of await readdir(join(output, path), {
    withFileTypes: true,
  })) {
    const child = `${path}/${entry.name}`
    if (entry.isDirectory()) await inventory(child)
    else
      buildFiles.push({
        path: child,
        sha256: createHash('sha256')
          .update(await readFile(join(output, child)))
          .digest('hex'),
      })
  }
}
await inventory('build')
const manifest = JSON.stringify(
  {
    schema: 1,
    target,
    mpv: {
      version: compatibility.libmpv.version,
      commit: compatibility.libmpv.sourceCommit,
    },
    ffmpeg: { version: '8.0.1', commit },
    files: files.sort((a, b) => a.path.localeCompare(b.path)),
    buildFiles: buildFiles.sort((a, b) => a.path.localeCompare(b.path)),
  },
  null,
  2,
)
await writeFile(join(output, 'sdk.json'), manifest)
console.log(
  JSON.stringify({
    target,
    files: files.length,
    sdkManifestSha256: createHash('sha256').update(manifest).digest('hex'),
  }),
)
