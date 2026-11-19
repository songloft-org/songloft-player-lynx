import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { clientSourceState } from './source-state.mjs'

const root = fileURLToPath(new URL('../..', import.meta.url))
const before = await clientSourceState(root)
// Build the existing app and the isolated native probe from the same pinned
// shared toolchain. Each output directory is cleaned by Rspeedy independently.
const probes = process.argv.includes('--without-probe') ? [false] : [false, true]
for (const probe of probes) {
  const result = spawnSync(
    process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm',
    ['exec', 'rspeedy', 'build', ...(probe ? ['--environment', 'lynx'] : [])],
    {
      cwd: root,
      stdio: 'inherit',
      env: { ...process.env, SONGLOFT_DESKTOP_PROBE: String(probe) },
      shell: process.platform === 'win32',
    },
  )
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)
}
const after = await clientSourceState(root)
if (
  before.sourceSha256 !== after.sourceSha256 ||
  before.clientSha !== after.clientSha
)
  throw new Error(
    'Client source changed during build; rebuild before packaging',
  )
await writeFile(
  join(root, 'dist', 'desktop-build.json'),
  JSON.stringify(
    {
      schema: 1,
      ...after,
      bundleSha256: createHash('sha256')
        .update(await readFile(join(root, 'dist', 'main.lynx.bundle')))
        .digest('hex'),
    },
    null,
    2,
  ),
)
