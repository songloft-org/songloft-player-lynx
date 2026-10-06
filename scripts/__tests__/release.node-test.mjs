import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import {
  bumpVersion,
  compareVersions,
  createBuildMetadata,
  validateBuildMetadata,
  validateVersion,
} from '../release-lib.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const now = new Date('2026-10-06T01:02:03Z')
const metadata = createBuildMetadata({
  packageVersion: '0.1.0',
  sha: 'abcdef0',
  now,
})

test('actual ZIP inspection rejects mismatched native versions, missing engines and debug payloads', (t) => {
  const dir = fixture(t)
  writeFileSync(join(dir, 'version.json'), JSON.stringify(metadata))
  const createZip = String.raw`
import json, plistlib, sys, zipfile
from pathlib import Path
root, kind, defect = Path(sys.argv[1]), sys.argv[2], sys.argv[3]
build = json.loads((root / 'version.json').read_text())
with zipfile.ZipFile(root / 'package.zip', 'w') as archive:
    if defect != 'missing-bundle':
        archive.writestr('assets/main.lynx.bundle', b'TestBridge.eval' if defect == 'debug' else b'production')
    number = build['build_number'] + (1 if defect == 'version' else 0)
    if kind == 'ios':
        archive.writestr('Payload/SongloftLynx.app/Info.plist', plistlib.dumps({'CFBundleShortVersionString': build['native_version'], 'CFBundleVersion': str(number)}))
    else:
        archive.writestr('module.json', json.dumps({'app': {'versionCode': number, 'versionName': build['native_version'] + '-dev'}}))
        if defect != 'engine': archive.writestr('libs/arm64-v8a/liblynx.so', b'engine')
`
  for (const kind of ['ios', 'harmony']) {
    for (const defect of [
      'none',
      'version',
      'missing-bundle',
      'debug',
      ...(kind === 'harmony' ? ['engine'] : []),
    ]) {
      execFileSync('python3', ['-c', createZip, dir, kind, defect])
      const result = spawnSync(
        'python3',
        [
          join(root, 'scripts/verify-package.py'),
          kind,
          join(dir, 'package.zip'),
          join(dir, 'version.json'),
        ],
        { encoding: 'utf8' },
      )
      assert.equal(
        result.status,
        defect === 'none' ? 0 : 1,
        `${kind}/${defect}: ${result.stderr}`,
      )
    }
  }
})

test('Web archive inspection rejects missing assets, wrong mode, version mismatch and unsafe paths', (t) => {
  const dir = fixture(t)
  writeFileSync(join(dir, 'version.json'), JSON.stringify(metadata))
  const createTar = String.raw`
import io, json, sys, tarfile
from pathlib import Path
root, defect = Path(sys.argv[1]), sys.argv[2]
metadata = json.loads((root / 'version.json').read_text())
if defect == 'metadata': metadata['git_commit'] = '0000000'
mode = 'embedded' if defect == 'mode' else 'standalone'
files = {'index.html': ('<script src="engine.js"></script><lynx-view global-props=\'{"deployMode":"' + mode + '"}\'></lynx-view>').encode(), 'main.lynx.bundle': b'production', 'version.json': json.dumps(metadata).encode()}
if defect != 'asset': files['engine.js'] = b'engine'
if defect == 'unsafe': files['../escape'] = b'unsafe'
with tarfile.open(root / 'package.tar.gz', 'w:gz') as archive:
    for name, data in files.items():
        info = tarfile.TarInfo(name); info.size = len(data); archive.addfile(info, io.BytesIO(data))
`
  for (const defect of ['none', 'asset', 'mode', 'metadata', 'unsafe']) {
    execFileSync('python3', ['-c', createTar, dir, defect])
    const result = spawnSync(
      'python3',
      [
        join(root, 'scripts/verify-package.py'),
        'web',
        join(dir, 'package.tar.gz'),
        join(dir, 'version.json'),
      ],
      { encoding: 'utf8' },
    )
    assert.equal(
      result.status,
      defect === 'none' ? 0 : 1,
      `${defect}: ${result.stderr}`,
    )
  }
})
function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'songloft-lynx-release-test-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  return dir
}

test('versions reject malformed and shell-like inputs; bumps respect SemVer ordering', () => {
  for (const input of [
    '01.2.3',
    '1.2',
    'v1.2.3',
    '1.2.3-beta.01',
    '1.2.3;echo',
    '1.2.3\n',
    '1.2.3+meta',
  ])
    assert.throws(() => validateVersion(input))
  assert.equal(bumpVersion('0.1.0', 'patch'), '0.1.1')
  assert.equal(bumpVersion('0.1.0', 'minor'), '0.2.0')
  assert.equal(bumpVersion('0.1.0', 'major'), '1.0.0')
  assert.equal(bumpVersion('0.1.0-beta.2', 'release'), '0.1.0')
  assert.equal(compareVersions('1.0.0', '1.0.0-rc.1'), 1)
  assert.equal(compareVersions('1.0.0-beta.10', '1.0.0-beta.2'), 1)
  assert.equal(compareVersions('1.0.0-beta.2', '1.0.0-beta.2.1'), -1)
})

test('dev/stable/preview metadata share a monotonic Android-compatible build number', () => {
  const stable = createBuildMetadata({
    packageVersion: '0.1.0',
    ref: 'refs/tags/v0.1.0',
    sha: 'abcdef0',
    now,
  })
  assert.equal(stable.build_number, metadata.build_number)
  assert.equal(stable.version, '0.1.0')
  assert.equal(stable.channel, 'stable')
  assert.equal(metadata.version, 'dev')
  assert.equal(metadata.release_tag, 'dev')
  const preview = createBuildMetadata({
    packageVersion: '0.2.0-beta.1',
    ref: 'refs/tags/v0.2.0-beta.1',
    now,
  })
  assert.equal(preview.channel, 'preview')
  assert.equal(preview.native_version, '0.2.0')
  assert.ok(
    createBuildMetadata({
      packageVersion: '0.1.0',
      now: new Date(now.getTime() + 1000),
    }).build_number > metadata.build_number,
  )
  assert.throws(() =>
    createBuildMetadata({ packageVersion: '0.1.0', ref: 'refs/tags/v0.2.0' }),
  )
  assert.throws(() =>
    createBuildMetadata({ packageVersion: '0.1.0', buildNumber: 2100000001 }),
  )
  for (const field of [
    'version',
    'package_version',
    'native_version',
    'build_number',
    'git_commit',
    'build_time',
    'channel',
    'release_tag',
  ]) {
    assert.throws(() =>
      validateBuildMetadata({ ...metadata, [field]: 'tampered' }, '0.1.0'),
    )
  }
})

function releaseRepo(t) {
  const directory = fixture(t)
  const repo = join(directory, 'repo')
  const remote = join(directory, 'remote.git')
  mkdirSync(join(repo, 'scripts'), { recursive: true })
  for (const name of ['bump-version.mjs', 'release-lib.mjs'])
    cpSync(join(root, 'scripts', name), join(repo, 'scripts', name))
  mkdirSync(join(repo, 'harmony/AppScope'), { recursive: true })
  mkdirSync(join(repo, 'ios/SongloftLynx.xcodeproj'), { recursive: true })
  writeFileSync(
    join(repo, 'package.json'),
    JSON.stringify({ version: '0.1.0' }),
  )
  writeFileSync(
    join(repo, 'harmony/AppScope/app.json5'),
    '{"app":{"versionName":"0.1.0","versionCode":1}}',
  )
  writeFileSync(
    join(repo, 'ios/SongloftLynx.xcodeproj/project.pbxproj'),
    'MARKETING_VERSION = 0.1.0;\nMARKETING_VERSION = 0.1.0;\n',
  )
  const git = (args) =>
    execFileSync('git', args, {
      cwd: repo,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim()
  execFileSync('git', ['init', '--bare', remote], { stdio: 'ignore' })
  git(['init', '-b', 'main'])
  git(['config', 'user.name', 'Release test'])
  git(['config', 'user.email', 'release-test@example.invalid'])
  git(['add', '.'])
  git(['commit', '-m', 'test: baseline'])
  git(['remote', 'add', 'origin', remote])
  git(['push', '-u', 'origin', 'main'])
  const run = (args) =>
    spawnSync(process.execPath, ['scripts/bump-version.mjs', ...args], {
      cwd: repo,
      encoding: 'utf8',
    })
  return { repo, remote, git, run }
}

test('release dry-run changes neither files, tags, HEAD nor remote refs', (t) => {
  const { repo, remote, git, run } = releaseRepo(t)
  const before = git(['rev-parse', 'HEAD'])
  const remoteBefore = execFileSync('git', ['--git-dir', remote, 'show-ref'], {
    encoding: 'utf8',
  })
  const result = run(['minor', '--dry-run'])
  assert.equal(result.status, 0, result.stderr)
  assert.equal(git(['rev-parse', 'HEAD']), before)
  assert.equal(git(['status', '--porcelain']), '')
  assert.equal(git(['tag']), '')
  assert.equal(
    JSON.parse(readFileSync(join(repo, 'package.json'))).version,
    '0.1.0',
  )
  assert.equal(
    execFileSync('git', ['--git-dir', remote, 'show-ref'], {
      encoding: 'utf8',
    }),
    remoteBefore,
  )
})

test('release CLI synchronizes native versions and atomically publishes only main and its tag', (t) => {
  const { repo, remote, git, run } = releaseRepo(t)
  const result = run(['minor', '--yes'])
  assert.equal(result.status, 0, result.stderr)
  assert.equal(
    JSON.parse(readFileSync(join(repo, 'package.json'))).version,
    '0.2.0',
  )
  assert.equal(
    JSON.parse(readFileSync(join(repo, 'harmony/AppScope/app.json5'))).app
      .versionName,
    '0.2.0',
  )
  assert.equal(
    readFileSync(
      join(repo, 'ios/SongloftLynx.xcodeproj/project.pbxproj'),
      'utf8',
    ),
    'MARKETING_VERSION = 0.2.0;\nMARKETING_VERSION = 0.2.0;\n',
  )
  assert.equal(git(['status', '--porcelain']), '')
  const remoteHead = execFileSync(
    'git',
    ['--git-dir', remote, 'rev-parse', 'main'],
    { encoding: 'utf8' },
  ).trim()
  assert.equal(remoteHead, git(['rev-parse', 'v0.2.0^{}']))
  assert.equal(run(['0.2.0', '--yes']).status, 1)
  assert.equal(run(['0.1.0', '--yes']).status, 1)
  git(['tag', 'v0.2.1'])
  assert.equal(run(['patch', '--yes']).status, 1)
})

test('release refuses dirty trees and non-main branches without changing HEAD', (t) => {
  const { repo, git, run } = releaseRepo(t)
  const before = git(['rev-parse', 'HEAD'])
  writeFileSync(join(repo, 'user-file'), 'preserve me')
  assert.equal(run(['patch', '--yes']).status, 1)
  assert.equal(git(['rev-parse', 'HEAD']), before)
  rmSync(join(repo, 'user-file'))
  git(['switch', '-c', 'other'])
  assert.equal(run(['patch', '--dry-run']).status, 1)
})

test('finalizer rejects incomplete assets and writes reproducible SHA-256 evidence', (t) => {
  const directory = fixture(t)
  const version = JSON.parse(readFileSync(join(root, 'package.json'))).version
  const meta = createBuildMetadata({ packageVersion: version, now })
  const names = [
    'songloft-lynx-android.apk',
    'songloft-lynx-ios-nosign.ipa',
    'songloft-lynx-harmony.hap',
    'songloft-lynx-web-standalone.tar.gz',
    'songloft-lynx-web-embedded.tar.gz',
  ]
  writeFileSync(join(directory, 'version.json'), JSON.stringify(meta))
  const run = () =>
    spawnSync(
      process.execPath,
      [join(root, 'scripts/finalize-release.mjs'), directory],
      { encoding: 'utf8' },
    )
  assert.equal(run().status, 1)
  for (const name of names) writeFileSync(join(directory, name), name)
  assert.equal(run().status, 0)
  const manifest = JSON.parse(readFileSync(join(directory, 'version.json')))
  for (const asset of manifest.assets) {
    assert.equal(
      asset.sha256,
      createHash('sha256')
        .update(readFileSync(join(directory, asset.name)))
        .digest('hex'),
    )
  }
  const checksums = readFileSync(join(directory, 'checksums.txt'), 'utf8')
  assert.equal(checksums.trim().split('\n').length, 6)
  assert.equal(run().status, 0)
  assert.equal(
    readFileSync(join(directory, 'checksums.txt'), 'utf8'),
    checksums,
  )
})

test('actual embedded Web output retains the bundle and engine after clearing stale assets', (t) => {
  const directory = fixture(t)
  // Runs the real copy script against the actual compiled bundle and installed web-core.
  const run = () =>
    execFileSync(
      process.execPath,
      [
        join(root, 'scripts/copy-bundle-web.mjs'),
        '--embedded',
        '--out-dir',
        directory,
      ],
      { cwd: root, encoding: 'utf8' },
    )
  run()
  writeFileSync(join(directory, 'stale-file'), 'old')
  run()
  assert.ok(readFileSync(join(directory, 'main.lynx.bundle')).length > 0)
  assert.ok(
    readFileSync(join(directory, 'web-core/static/js/client.js')).length > 0,
  )
  assert.ok(
    !readFileSync(join(directory, 'index.html'), 'utf8').includes(
      'global-props=\'{"deployMode":"standalone"}\'',
    ),
  )
})
