import { execFileSync, spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createInterface } from 'node:readline/promises'
import {
  bumpVersion,
  compareVersions,
  syncNativeVersions,
} from './release-lib.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const git = (args) =>
  execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim()
const args = process.argv.slice(2)
const flags = new Set(args.filter((arg) => arg.startsWith('--')))
const kinds = args.filter((arg) => !arg.startsWith('--'))

try {
  if (flags.has('--help')) {
    console.log(
      'Usage: pnpm run release [patch|minor|major|release|X.Y.Z[-prerelease]] [--dry-run] [--yes] [--no-push]\nUpdates versions, commits, creates v* tag, then atomically pushes main and that tag.\n--dry-run never modifies files, tags, or remote state.',
    )
    process.exit(0)
  }
  if (
    kinds.length > 1 ||
    [...flags].some(
      (flag) => !['--dry-run', '--yes', '--no-push'].includes(flag),
    )
  )
    throw new Error('Unknown argument; use --help')
  if (git(['branch', '--show-current']) !== 'main')
    throw new Error('Release must run on main')
  const packagePath = resolve(root, 'package.json')
  const pkg = JSON.parse(readFileSync(packagePath, 'utf8'))
  const next = bumpVersion(pkg.version, kinds[0] ?? 'patch')
  if (compareVersions(next, pkg.version) <= 0)
    throw new Error('The new version must be newer than the current version')
  const tag = `v${next}`
  if (
    spawnSync('git', ['show-ref', '--verify', '--quiet', `refs/tags/${tag}`], {
      cwd: root,
    }).status === 0
  )
    throw new Error(`Tag ${tag} already exists`)
  console.log(
    `${pkg.version} → ${next}\nFiles: package.json, harmony/AppScope/app.json5, ios/SongloftLynx.xcodeproj/project.pbxproj\nCommit: chore(release): 发布 ${next}\nTag: ${tag}\nPush: ${flags.has('--no-push') ? 'disabled' : 'main + tag (atomic)'}`,
  )
  if (flags.has('--dry-run')) process.exit(0)
  if (git(['status', '--porcelain']))
    throw new Error(
      'Working tree must be clean; commit or preserve your changes first',
    )
  // Check remote conflicts before modifying files. Exit 2 means the ref is absent.
  const remote = spawnSync(
    'git',
    ['ls-remote', '--exit-code', '--tags', 'origin', `refs/tags/${tag}`],
    { cwd: root, encoding: 'utf8' },
  )
  if (remote.status === 0)
    throw new Error(
      `Remote tag ${tag} already exists; tags are never overwritten`,
    )
  if (remote.status !== 2)
    throw new Error(`Cannot check remote tag: ${remote.stderr}`)
  git(['fetch', 'origin', 'main'])
  if (
    spawnSync('git', ['merge-base', '--is-ancestor', 'origin/main', 'HEAD'], {
      cwd: root,
    }).status !== 0
  )
    throw new Error('Local main is behind or diverged from origin/main')
  if (!flags.has('--yes')) {
    const prompt = createInterface({
      input: process.stdin,
      output: process.stdout,
    })
    const answer = await prompt.question(`Release ${tag}? [y/N] `)
    prompt.close()
    if (!/^y(es)?$/i.test(answer.trim())) process.exit(0)
  }
  // Validate/sync native files before changing package.json.
  syncNativeVersions(root, next)
  pkg.version = next
  writeFileSync(packagePath, JSON.stringify(pkg, null, 2) + '\n')
  git([
    'add',
    'package.json',
    'harmony/AppScope/app.json5',
    'ios/SongloftLynx.xcodeproj/project.pbxproj',
  ])
  git(['diff', '--cached', '--check'])
  git(['commit', '-m', `chore(release): 发布 ${next}`])
  git(['tag', '-a', tag, '-m', `Release ${next}`])
  if (!flags.has('--no-push'))
    git([
      'push',
      '--atomic',
      'origin',
      'HEAD:refs/heads/main',
      `refs/tags/${tag}`,
    ])
  console.log(
    `Prepared ${tag}${flags.has('--no-push') ? ' locally' : ': https://github.com/songloft-org/songloft-player-lynx/releases/tag/' + tag}`,
  )
} catch (error) {
  console.error(`[release] ${error.message}`)
  process.exitCode = 1
}
