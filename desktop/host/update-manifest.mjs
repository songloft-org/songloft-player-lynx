import { createPublicKey, verify, createHash } from 'node:crypto'
import semver from 'semver'

// Sign the original UTF-8 bytes, not a re-serialized JSON object. Helpers use
// the same envelope and must independently verify before touching an app.
export function verifyManifest(
  envelope,
  {
    publicKey,
    channel,
    os,
    arch,
    currentVersion,
    currentClientSha,
    currentBuiltAt,
    variant = 'bundled',
    now = Date.now(),
  },
) {
  if (
    !['dev', 'stable'].includes(channel) ||
    !['darwin-arm64', 'darwin-x64', 'win32-x64'].includes(`${os}-${arch}`)
  )
    throw new Error('invalid_update_target')
  if (
    !envelope ||
    typeof envelope.payload !== 'string' ||
    typeof envelope.signature !== 'string' ||
    envelope.payload.length > 128 * 1024 ||
    envelope.signature.length > 128
  )
    throw new Error('invalid_update_manifest')
  const payload = Buffer.from(envelope.payload, 'base64')
  const key = createPublicKey(publicKey)
  if (
    key.asymmetricKeyType !== 'ed25519' ||
    !verify(null, payload, key, Buffer.from(envelope.signature, 'base64'))
  )
    throw new Error('invalid_update_signature')
  const manifest = JSON.parse(payload.toString('utf8'))
  if (
    manifest.schema !== 1 ||
    manifest.channel !== channel ||
    (manifest.variant ?? 'bundled') !== variant ||
    manifest.os !== os ||
    manifest.arch !== arch ||
    semver.valid(manifest.version) !== manifest.version ||
    semver.valid(currentVersion) !== currentVersion ||
    !/^[a-f0-9]{40}$/.test(manifest.clientSha) ||
    !/^[a-f0-9]{40}$/.test(manifest.backendSha) ||
    !Number.isFinite(Date.parse(manifest.publishedAt)) ||
    Date.parse(manifest.publishedAt) > now + 5 * 60 * 1000
  )
    throw new Error('invalid_update_target')
  const asset = manifest.asset
  if (
    !asset ||
    !Number.isSafeInteger(asset.size) ||
    asset.size < 1 ||
    asset.size > 8 * 1024 ** 3 ||
    !/^[a-f0-9]{64}$/.test(asset.sha256) ||
    asset.kind !== (os === 'darwin' ? 'app-zip' : 'nsis') ||
    new URL(asset.url).protocol !== 'https:'
  )
    throw new Error('invalid_update_asset')
  const rolling =
    channel === 'dev' &&
    semver.eq(manifest.version, currentVersion) &&
    /^[a-f0-9]{40}$/.test(currentClientSha ?? '') &&
    currentClientSha !== manifest.clientSha &&
    Number.isFinite(Date.parse(currentBuiltAt)) &&
    Date.parse(manifest.publishedAt) > Date.parse(currentBuiltAt)
  return {
    ...manifest,
    available: semver.gt(manifest.version, currentVersion) || rolling,
    manifestSha256: createHash('sha256').update(payload).digest('hex'),
  }
}
