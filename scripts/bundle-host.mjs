import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { createNativeHostMetadata, loadNativeContract } from './update-release-lib.mjs'

/** Snapshot the SAME metadata that is injected into this compiled bundle. */
export function writeBundleHost(root, metadata) {
  const contract = loadNativeContract(root)
  let host = createNativeHostMetadata(metadata, contract, process.env.SONGLOFT_UPDATE_PUBLIC_KEY ?? '')
  const preparedPath = join(root, '.build/native-host.json')
  if (!process.env.SONGLOFT_UPDATE_PUBLIC_KEY && existsSync(preparedPath)) {
    const prepared = JSON.parse(readFileSync(preparedPath, 'utf8'))
    const { trusted_keys: keys, ...identity } = prepared
    const { trusted_keys: _empty, ...expected } = host
    if (isDeepStrictEqual(identity, expected)) host = { ...host, trusted_keys: keys }
    else if (process.env.SONGLOFT_BUILD_METADATA) throw new Error('Prepared native host differs from bundle build metadata')
  }
  mkdirSync(join(root, '.build'), { recursive: true })
  writeFileSync(join(root, '.build/bundle-host.json'), JSON.stringify(host, null, 2) + '\n')
}
