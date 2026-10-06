import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const VERSION =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/
const BUILD_EPOCH = Date.parse('2020-01-01T00:00:00Z')

export function validateVersion(version) {
  if (typeof version !== 'string' || !VERSION.test(version))
    throw new Error(`Invalid version: ${version}`)
  const prerelease = version.split('-').slice(1).join('-')
  if (prerelease.split('.').some((part) => /^0\d+$/.test(part)))
    throw new Error(`Invalid prerelease: ${version}`)
  return version
}

export function compareVersions(left, right) {
  const a = VERSION.exec(validateVersion(left))
  const b = VERSION.exec(validateVersion(right))
  for (let i = 1; i <= 3; i++) {
    const diff = BigInt(a[i]) - BigInt(b[i])
    if (diff !== 0n) return diff > 0n ? 1 : -1
  }
  if (!a[4] || !b[4]) return a[4] === b[4] ? 0 : a[4] ? -1 : 1
  const ap = a[4].split('.')
  const bp = b[4].split('.')
  for (let i = 0; i < Math.max(ap.length, bp.length); i++) {
    if (ap[i] === undefined) return -1
    if (bp[i] === undefined) return 1
    if (ap[i] === bp[i]) continue
    const an = /^\d+$/.test(ap[i])
    const bn = /^\d+$/.test(bp[i])
    if (an && bn) return BigInt(ap[i]) > BigInt(bp[i]) ? 1 : -1
    if (an !== bn) return an ? -1 : 1
    return ap[i] > bp[i] ? 1 : -1
  }
  return 0
}

export function bumpVersion(current, kind = 'patch') {
  const parts = VERSION.exec(validateVersion(current))
  const nums = parts.slice(1, 4).map(Number)
  if (kind === 'release') return nums.join('.')
  const index = { major: 0, minor: 1, patch: 2 }[kind]
  if (index === undefined) return validateVersion(kind)
  nums[index]++
  for (let i = index + 1; i < 3; i++) nums[i] = 0
  return nums.join('.')
}

export function createBuildMetadata({
  packageVersion,
  ref = '',
  sha = 'unknown',
  now = new Date(),
  buildNumber,
} = {}) {
  validateVersion(packageVersion)
  const tag = ref.startsWith('refs/tags/') ? ref.slice('refs/tags/'.length) : ''
  if (tag && tag !== `v${packageVersion}`)
    throw new Error(`Tag ${tag} does not match package.json v${packageVersion}`)
  if (sha !== 'unknown' && !/^[0-9a-f]{7,40}$/.test(sha))
    throw new Error('Invalid git commit')
  const buildTime = now.toISOString()
  const number = buildNumber ?? Math.floor((now.getTime() - BUILD_EPOCH) / 1000)
  if (!Number.isSafeInteger(number) || number <= 0 || number > 2100000000)
    throw new Error('Invalid Android build number')
  return {
    version: tag ? packageVersion : 'dev',
    package_version: packageVersion,
    native_version: packageVersion.split('-')[0],
    build_number: number,
    git_commit: sha,
    build_time: buildTime,
    channel: tag
      ? packageVersion.includes('-')
        ? 'preview'
        : 'stable'
      : 'dev',
    release_tag: tag || 'dev',
  }
}

export function validateBuildMetadata(value, packageVersion) {
  const expected = createBuildMetadata({
    packageVersion,
    ref: value?.release_tag === 'dev' ? '' : `refs/tags/${value?.release_tag}`,
    sha: value?.git_commit,
    now: new Date(value?.build_time),
    buildNumber: value?.build_number,
  })
  for (const [key, expectedValue] of Object.entries(expected)) {
    if (value[key] !== expectedValue)
      throw new Error(`Invalid build metadata field: ${key}`)
  }
  return expected
}

export function syncNativeVersions(root, version) {
  const nativeVersion = validateVersion(version).split('-')[0]
  const harmonyPath = join(root, 'harmony/AppScope/app.json5')
  const iosPath = join(root, 'ios/SongloftLynx.xcodeproj/project.pbxproj')
  const harmony = readFileSync(harmonyPath, 'utf8')
  const ios = readFileSync(iosPath, 'utf8')
  if ((harmony.match(/"versionName"\s*:/g) ?? []).length !== 1)
    throw new Error('Unexpected HarmonyOS version fields')
  if ((ios.match(/MARKETING_VERSION = [^;]+;/g) ?? []).length !== 2)
    throw new Error('Unexpected iOS version fields')
  writeFileSync(
    harmonyPath,
    harmony.replace(/("versionName"\s*:\s*")[^"]+(")/, `$1${nativeVersion}$2`),
  )
  writeFileSync(
    iosPath,
    ios.replace(
      /MARKETING_VERSION = [^;]+;/g,
      `MARKETING_VERSION = ${nativeVersion};`,
    ),
  )
}

export function listReleaseAssets(directory) {
  return readdirSync(directory)
    .sort()
    .filter((name) => name !== 'version.json' && name !== 'checksums.txt')
    .map((name) => {
      if (!/^[a-zA-Z0-9._-]+$/.test(name))
        throw new Error(`Unexpected release asset: ${name}`)
      const path = join(directory, name)
      if (!statSync(path).isFile() || statSync(path).size === 0)
        throw new Error(`Empty or invalid asset: ${name}`)
      return {
        name,
        size: statSync(path).size,
        sha256: createHash('sha256').update(readFileSync(path)).digest('hex'),
      }
    })
}
