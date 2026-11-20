import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import {
  readFile,
  writeFile,
  unlink,
  access,
  mkdir,
  copyFile,
} from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import yaml from 'js-yaml'
import { packageConfig } from './package-config.mjs'
import { stageCef } from './stage-cef.mjs'
import { assertTarget } from '../target.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const arch = process.argv.includes('--x64')
  ? 'x64'
  : process.argv.includes('--arm64')
    ? 'arm64'
    : process.arch
const target = assertTarget(process.platform, arch)
const metadata = JSON.parse(
  await readFile(join(root, 'resources', target, 'build-info.json'), 'utf8'),
)
if (metadata.target !== target || !['dev', 'stable'].includes(metadata.channel))
  throw new Error('Invalid package metadata')
if (metadata.channel === 'stable' && metadata.dirty)
  throw new Error('Cannot release a dirty backend')
const require = createRequire(join(root, 'package.json'))
const builderRequire = createRequire(
  require.resolve('@lynx-js/lynxtron-builder'),
)
// Verify pnpm applied our pinned copies of the official packaging patches.
const collector = await readFile(
  builderRequire.resolve('app-builder-lib/out/electron/ElectronFramework.js'),
  'utf8',
)
if (!collector.includes('lynxtron') && !collector.includes('Lynxtron'))
  throw new Error('Lynxtron builder patch is missing')
await stageCef(root, target)
await mkdir(join(root, '.lynxtron', 'app'), { recursive: true })
await copyFile(
  join(root, '..', 'dist', 'main.lynx.bundle'),
  join(root, '.lynxtron', 'app', 'main.lynx.bundle'),
)
await copyFile(
  join(root, '..', 'web', 'app_icon.png'),
  join(root, '.lynxtron', 'app', 'app_icon.png'),
)
const configPath = join(root, 'electron-builder.yml')
try {
  await access(configPath)
  throw new Error('Refusing to overwrite an existing packaging configuration')
} catch (error) {
  if (error.code !== 'ENOENT') throw error
}
try {
  await writeFile(
    configPath,
    yaml.dump(
      packageConfig({
        channel: metadata.channel,
        variant: metadata.variant,
        version: metadata.version,
        target,
        root,
      }),
    ),
  )
  const result = spawnSync(
    process.execPath,
    [
      require.resolve('@lynx-js/lynxtron-builder'),
      process.platform === 'darwin' ? '--mac' : '--win',
      `--${arch}`,
      '--publish',
      'never',
    ],
    { cwd: root, stdio: 'inherit', env: process.env },
  )
  if (result.error) throw result.error
  if (result.status !== 0) process.exitCode = result.status ?? 1
} finally {
  await unlink(configPath)
}
