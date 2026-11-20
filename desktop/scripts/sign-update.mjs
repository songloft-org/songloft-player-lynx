import { createHash, createPrivateKey, createPublicKey, sign } from 'node:crypto'
import { readFile, writeFile, open } from 'node:fs/promises'
import { basename } from 'node:path'
import semver from 'semver'
import { assertTarget } from '../target.mjs'
const [metadataPath, assetPath, assetUrl, output] = process.argv.slice(2)
const keyPath = process.env.SONGLOFT_DESKTOP_UPDATE_PRIVATE_KEY
const keyPEM = process.env.SONGLOFT_DESKTOP_UPDATE_PRIVATE_KEY_PEM
if (
  !metadataPath ||
  !assetPath ||
  !assetUrl ||
  !output ||
  (!keyPath && !keyPEM)
)
  throw new Error(
    'Usage: sign-update.mjs build-info.json asset https://asset-url output.json; private key via SONGLOFT_DESKTOP_UPDATE_PRIVATE_KEY (path) or SONGLOFT_DESKTOP_UPDATE_PRIVATE_KEY_PEM',
  )
const metadata = JSON.parse(await readFile(metadataPath, 'utf8'))
const [os, arch] = metadata.target.split('-')
assertTarget(os, arch)
if (
  !semver.valid(metadata.version) ||
  !['dev', 'stable'].includes(metadata.channel) ||
  !['standard', 'bundled'].includes(metadata.variant) ||
  !/^[a-f0-9]{40}$/.test(metadata.clientSha) ||
  !/^[a-f0-9]{40}$/.test(metadata.backendSha) ||
  (metadata.dirty && metadata.channel !== 'dev') ||
  new URL(assetUrl).protocol !== 'https:'
)
  throw new Error('Invalid update metadata')
if (
  !(os === 'darwin' ? assetPath.endsWith('.zip') : assetPath.endsWith('.exe'))
)
  throw new Error('Wrong update asset type')
const handle = await open(assetPath, 'r')
const digest = createHash('sha256')
let size = 0
try {
  for await (const chunk of handle.createReadStream({ autoClose: false })) {
    digest.update(chunk)
    size += chunk.length
  }
} finally {
  await handle.close()
}
const payload = Buffer.from(
  JSON.stringify({
    schema: 1,
    version: metadata.version,
    channel: metadata.channel,
    variant: metadata.variant,
    os,
    arch,
    clientSha: metadata.clientSha,
    backendSha: metadata.backendSha,
    publishedAt: metadata.builtAt,
    asset: {
      url: assetUrl,
      size,
      sha256: digest.digest('hex'),
      kind: os === 'darwin' ? 'app-zip' : 'nsis',
    },
  }),
)
const key = createPrivateKey(keyPEM || await readFile(keyPath))
if (key.asymmetricKeyType !== 'ed25519')
  throw new Error('Desktop update key must be Ed25519')
const trustedKey = createPublicKey(metadata.updatePublicKey)
if (!trustedKey.equals(createPublicKey(key)))
  throw new Error('Desktop signing key does not match the packaged public key')
await writeFile(
  output,
  JSON.stringify({
    payload: payload.toString('base64'),
    signature: sign(null, payload, key).toString('base64'),
  }) + '\n',
)
console.log(`Signed desktop manifest: ${basename(output)}`)
