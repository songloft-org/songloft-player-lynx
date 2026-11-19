import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

if (!process.env.SONGLOFT_MPV_ROOT)
  throw new Error(
    'Set SONGLOFT_MPV_ROOT to the libmpv SDK with include/mpv headers.',
  )
const root = fileURLToPath(new URL('..', import.meta.url))
const output = mkdtempSync(join(tmpdir(), 'songloft-mpv-test-'))
try {
  const executable = join(
    output,
    process.platform === 'win32' ? 'engine-test.exe' : 'engine-test',
  )
  const compiler =
    process.env.CXX || (process.platform === 'win32' ? 'cl' : 'c++')
  const source = join(root, 'tests', 'mpv-engine-test.cc')
  const include = join(process.env.SONGLOFT_MPV_ROOT, 'include')
  const native = join(root, 'native')
  const args =
    process.platform === 'win32'
      ? [
          '/nologo',
          '/EHsc',
          '/std:c++17',
          '/utf-8',
          `/I${include}`,
          `/I${native}`,
          source,
          `/Fe:${executable}`,
          `/Fo:${join(output, 'engine-test.obj')}`,
        ]
      : [
          '-std=c++17',
          '-Wall',
          '-Wextra',
          '-I',
          include,
          '-I',
          native,
          source,
          '-o',
          executable,
        ]
  for (const [command, commandArgs] of [
    [compiler, args],
    [executable, []],
  ]) {
    const result = spawnSync(command, commandArgs, {
      stdio: 'inherit',
      cwd: output,
    })
    if (result.error) throw result.error
    if (result.status !== 0)
      throw new Error(`${command} failed (${result.status})`)
  }
} finally {
  rmSync(output, { recursive: true, force: true })
}
