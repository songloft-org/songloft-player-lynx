import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { finalizeRelease, loadNativeContract } from './update-release-lib.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const result = finalizeRelease({
  directory: resolve(process.argv[2] ?? 'release-files'),
  bundleSource: process.argv[3] ? resolve(process.argv[3]) : undefined,
  nativeHost: process.argv[4] ? JSON.parse(readFileSync(resolve(process.argv[4]), 'utf8')) : undefined,
  packageVersion: JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')).version,
  contract: loadNativeContract(root),
  publicKey: process.env.SONGLOFT_UPDATE_PUBLIC_KEY ?? '',
  privateKey: process.env.SONGLOFT_UPDATE_PRIVATE_KEY ?? '',
})
console.log(`Verified ${result.assetCount} release assets; signed bundle update: ${result.signedUpdate}`)
