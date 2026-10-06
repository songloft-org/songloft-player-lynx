import { constants, createHash, createPrivateKey, createPublicKey, sign, verify } from 'node:crypto'
import { copyFileSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { listReleaseAssets, validateBuildMetadata, validateVersion } from './release-lib.mjs'

export const UPDATE_ALGORITHM = 'rsa-pkcs1v15-sha256'
export const BUNDLE_ASSET = 'songloft-lynx-main.lynx.bundle'
export const SIGNATURE_ASSET = 'version.json.sig'
export const MAX_BUNDLE_BYTES = 32 * 1024 * 1024
export const MAX_MANIFEST_BYTES = 128 * 1024

export function loadNativeContract(root) {
  const contract = JSON.parse(readFileSync(join(root, 'updates/native-contract.json'), 'utf8'))
  if (contract.protocol !== 1 || [contract.bridge_version, contract.local_schema]
    .some((value) => !Number.isSafeInteger(value) || value < 1 || value > 65535))
    throw new Error('Unsupported native update contract')
  validateVersion(contract.minimum_host_version)
  if (contract.minimum_host_version.includes('-')) throw new Error('Minimum native version must be stable')
  if (!Array.isArray(contract.required_capabilities) || contract.required_capabilities.length === 0 ||
      contract.required_capabilities.some((value) => typeof value !== 'string' || !/^[a-zA-Z0-9.]+$/.test(value)))
    throw new Error('Invalid required native capabilities')
  for (const platform of ['android', 'ios', 'harmony']) validateVersion(contract.engines?.[platform])
  const android = readFileSync(join(root, 'android/app/build.gradle.kts'), 'utf8')
    .match(/implementation\("org\.lynxsdk\.lynx:lynx:([^"\n]+)"\)/)?.[1]
  const ios = readFileSync(join(root, 'ios/Podfile.lock'), 'utf8').match(/^  - Lynx \(([^)]+)\):/m)?.[1]
  const harmony = readFileSync(join(root, 'harmony/entry/oh-package.json5'), 'utf8')
    .match(/"@lynx\/lynx"\s*:\s*"([^"]+)"/)?.[1]
  for (const [platform, version] of Object.entries({ android, ios, harmony })) {
    if (contract.engines[platform] !== version) throw new Error(`Update contract engine differs from ${platform} dependency`)
  }
  return contract
}

/** SPKI for Java/ArkTS; PKCS#1 for SecKey. Both encode the same pinned key. */
export function publicKeyRecord(pem) {
  if (!pem || typeof pem !== 'string' || !pem.trim().startsWith('-----BEGIN PUBLIC KEY-----'))
    throw new Error('Update public key must be an SPKI PEM public key')
  const key = createPublicKey(pem)
  if (key.asymmetricKeyType !== 'rsa' || ![2048, 3072, 4096].includes(key.asymmetricKeyDetails.modulusLength))
    throw new Error('Update signing requires a 2048, 3072 or 4096 bit RSA key')
  const spki = key.export({ type: 'spki', format: 'der' })
  return {
    key_id: createHash('sha256').update(spki).digest('hex').slice(0, 16),
    key_bits: key.asymmetricKeyDetails.modulusLength,
    algorithm: UPDATE_ALGORITHM,
    spki_base64: spki.toString('base64'),
    pkcs1_base64: key.export({ type: 'pkcs1', format: 'der' }).toString('base64'),
  }
}

export function createNativeHostMetadata(metadata, contract, publicKey = '') {
  return {
    ...metadata,
    update_protocol: contract.protocol,
    bridge_version: contract.bridge_version,
    local_schema: contract.local_schema,
    capabilities: [...contract.required_capabilities],
    engines: { ...contract.engines },
    trusted_keys: publicKey.trim() ? [publicKeyRecord(publicKey)] : [],
  }
}

function hashFile(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex')
}

function writeAtomic(file, data) {
  const temp = `${file}.part`
  try { writeFileSync(temp, data); renameSync(temp, file) }
  finally { rmSync(temp, { force: true }) }
}

export function verifyUpdateSignature(rawManifest, envelope, trustedKeys) {
  if (!Buffer.isBuffer(rawManifest) || rawManifest.length === 0 || rawManifest.length > MAX_MANIFEST_BYTES)
    throw new Error('Invalid update manifest size')
  if (envelope?.protocol !== 1 || envelope?.algorithm !== UPDATE_ALGORITHM ||
      typeof envelope?.signature !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(envelope.signature))
    throw new Error('Invalid update signature envelope')
  const record = trustedKeys.find((key) => key.key_id === envelope.key_id && key.algorithm === UPDATE_ALGORITHM)
  if (!record) throw new Error('Unknown update signing key')
  const key = createPublicKey({ key: Buffer.from(record.spki_base64, 'base64'), type: 'spki', format: 'der' })
  const signature = Buffer.from(envelope.signature, 'base64')
  if (signature.toString('base64') !== envelope.signature ||
      !verify('sha256', rawManifest, { key, padding: constants.RSA_PKCS1_PADDING }, signature))
    throw new Error('Update signature verification failed')
  return JSON.parse(rawManifest.toString('utf8'))
}

/** No trusted public/private pair => full packages only; never emit unsigned bundles. */
export function finalizeRelease({ directory, packageVersion, contract, bundleSource,
  nativeHost, publicKey = '', privateKey = '' }) {
  const original = JSON.parse(readFileSync(join(directory, 'version.json'), 'utf8'))
  const metadata = validateBuildMetadata(original, packageVersion)
  const expected = [
    'songloft-lynx-android.apk', 'songloft-lynx-ios-nosign.ipa', 'songloft-lynx-harmony.hap',
    'songloft-lynx-web-standalone.tar.gz', 'songloft-lynx-web-embedded.tar.gz',
  ]
  const allowed = new Set([...expected, 'version.json', 'checksums.txt', BUNDLE_ASSET, SIGNATURE_ASSET])
  if (readdirSync(directory).some((name) => !allowed.has(name)) ||
      expected.some((name) => !statSync(join(directory, name)).isFile() || statSync(join(directory, name)).size === 0))
    throw new Error('Release must contain exactly the five platform packages and optional signed update assets')

  let record = null
  let signingKey = null
  let bundleUpdate = null
  if (privateKey.trim()) {
    record = publicKeyRecord(publicKey)
    if (!nativeHost) throw new Error('Missing immutable native host metadata')
    validateBuildMetadata(nativeHost, packageVersion)
    for (const field of Object.keys(metadata)) {
      if (nativeHost[field] !== metadata[field]) throw new Error('Native host and release metadata differ')
    }
    const expectedHost = createNativeHostMetadata(metadata, contract, publicKey)
    for (const field of ['update_protocol', 'bridge_version', 'local_schema', 'capabilities', 'engines', 'trusted_keys']) {
      if (!isDeepStrictEqual(nativeHost[field], expectedHost[field]))
        throw new Error('Native host update contract or pinned key differs from the release')
    }
    signingKey = createPrivateKey(privateKey)
    const actualPublic = createPublicKey(signingKey).export({ type: 'spki', format: 'pem' }).toString()
    if (publicKeyRecord(actualPublic).key_id !== record.key_id)
      throw new Error('Update private key does not match the public key pinned in the native shell')
    if (!bundleSource || !statSync(bundleSource).isFile()) throw new Error('Missing native update bundle')
    const files = readdirSync(dirname(resolve(bundleSource)))
    if (files.some((name) => name !== 'main.lynx.bundle' && name !== 'web'))
      throw new Error('Native bundle has external build assets; update packaging must include them first')
    const size = statSync(bundleSource).size
    if (size <= 0 || size > MAX_BUNDLE_BYTES) throw new Error('Update bundle exceeds the size limit')
    const bytes = readFileSync(bundleSource)
    if (['TestBridge.eval', '__E2E_PLAYER_STORE__', '__E2E_AUTH_STORE__'].some((value) => bytes.includes(value)))
      throw new Error('Update bundle contains a debug evaluator')
    bundleUpdate = {
      protocol: contract.protocol,
      bundle_id: `${metadata.channel}-${metadata.build_number}-${metadata.git_commit}`,
      asset: BUNDLE_ASSET,
      size,
      sha256: hashFile(bundleSource),
      local_schema: contract.local_schema,
      targets: ['android', 'ios', 'harmony'].map((platform) => ({
        platform,
        engine: contract.engines[platform],
        minimum_host_version: contract.minimum_host_version,
        minimum_bridge: contract.bridge_version,
        maximum_bridge: contract.bridge_version,
        required_capabilities: [...contract.required_capabilities],
      })),
    }
  } else if (publicKey.trim()) {
    publicKeyRecord(publicKey)
  }

  const packageAssets = listReleaseAssets(directory).filter((asset) => expected.includes(asset.name))
  const assets = bundleUpdate ? [...packageAssets, { name: BUNDLE_ASSET, size: bundleUpdate.size, sha256: bundleUpdate.sha256 }]
    .sort((a, b) => a.name.localeCompare(b.name, 'en')) : packageAssets
  const rawManifest = Buffer.from(JSON.stringify({ ...metadata, assets, bundle_update: bundleUpdate }, null, 2) + '\n')
  if (rawManifest.length > MAX_MANIFEST_BYTES) throw new Error('Update manifest exceeds the size limit')
  const envelope = signingKey ? {
    protocol: 1, key_id: record.key_id, algorithm: UPDATE_ALGORITHM,
    signature: sign('sha256', rawManifest, { key: signingKey, padding: constants.RSA_PKCS1_PADDING }).toString('base64'),
  } : null
  if (envelope) verifyUpdateSignature(rawManifest, envelope, [record])

  if (bundleUpdate) {
    const dest = join(directory, BUNDLE_ASSET)
    try { copyFileSync(bundleSource, `${dest}.part`); renameSync(`${dest}.part`, dest) }
    finally { rmSync(`${dest}.part`, { force: true }) }
    writeAtomic(join(directory, SIGNATURE_ASSET), JSON.stringify(envelope) + '\n')
  } else {
    rmSync(join(directory, BUNDLE_ASSET), { force: true })
    rmSync(join(directory, SIGNATURE_ASSET), { force: true })
  }
  writeAtomic(join(directory, 'version.json'), rawManifest)
  const checksums = [...assets.map((asset) => `${asset.sha256}  ${asset.name}`),
    `${hashFile(join(directory, 'version.json'))}  version.json`,
    ...(envelope ? [`${hashFile(join(directory, SIGNATURE_ASSET))}  ${SIGNATURE_ASSET}`] : [])]
  writeAtomic(join(directory, 'checksums.txt'), checksums.join('\n') + '\n')
  return { assetCount: assets.length, signedUpdate: envelope != null }
}
