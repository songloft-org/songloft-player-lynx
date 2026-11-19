import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { assertTarget } from '../target.mjs'
import { stageCef } from './stage-cef.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const target = assertTarget()
const require = createRequire(new URL('../package.json', import.meta.url))
const headers = dirname(
  require.resolve('@lynx-js/lynx-library-headers/package.json'),
)
if (!process.env.SONGLOFT_MPV_ROOT)
  throw new Error(
    'Set SONGLOFT_MPV_ROOT to the absolute libmpv 0.41.0 SDK directory (include/mpv + lib).',
  )
const build = resolve(root, '.build', `${process.platform}-${process.arch}`)
for (const args of [
  [
    '-S',
    resolve(root, 'native'),
    '-B',
    build,
    `-DLYNX_HEADERS=${headers}`,
    `-DMPV_ROOT=${resolve(process.env.SONGLOFT_MPV_ROOT)}`,
    '-DCMAKE_BUILD_TYPE=Release',
    ...(process.platform === 'darwin'
      ? [
          `-DCMAKE_OSX_ARCHITECTURES=${process.arch === 'x64' ? 'x86_64' : 'arm64'}`,
          '-DCMAKE_OSX_DEPLOYMENT_TARGET=13.0',
        ]
      : ['-A', 'x64']),
  ],
  ['--build', build, '--config', 'Release'],
]) {
  const result = spawnSync('cmake', args, { cwd: root, stdio: 'inherit' })
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)
}
await stageCef(root, target)
