import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFile, lstat } from 'node:fs/promises'
import { join } from 'node:path'
export async function clientSourceState(directory) {
  const inputs = [
    'src',
    'desktop',
    'scripts',
    'web',
    'package.json',
    'pnpm-lock.yaml',
    'lynx.config.ts',
    '.github/workflows/build-and-release.yml',
    '.github/workflows/resolve-backend.yml',
    '.gitignore',
  ]
  const git = (args) => {
    const result = spawnSync('git', args, { cwd: directory, encoding: 'utf8' })
    if (result.status !== 0)
      throw new Error('Client source identity is unavailable')
    return result.stdout
  }
  const paths = new Set(
    git([
      'ls-files',
      '-z',
      '--cached',
      '--others',
      '--exclude-standard',
      '--',
      ...inputs,
    ])
      .split('\0')
      .filter(Boolean),
  )
  const digest = createHash('sha256')
  for (const path of [...paths].sort()) {
    const file = join(directory, path),
      info = await lstat(file).catch(() => null)
    if (!info?.isFile()) continue
    digest
      .update(path)
      .update('\0')
      .update(await readFile(file))
      .update('\0')
  }
  return {
    clientSha: git(['rev-parse', 'HEAD']).trim(),
    sourceSha256: digest.digest('hex'),
    dirty: !!git([
      'status',
      '--porcelain',
      '--untracked-files=all',
      '--',
      ...inputs,
    ]).trim(),
  }
}
