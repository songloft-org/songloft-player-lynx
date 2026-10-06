import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { listReleaseAssets, validateBuildMetadata } from './release-lib.mjs'

const directory = resolve(process.argv[2] ?? 'release-files')
const metadata = JSON.parse(
  readFileSync(resolve(directory, 'version.json'), 'utf8'),
)
validateBuildMetadata(
  metadata,
  JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
    .version,
)
const expected = [
  'songloft-lynx-android.apk',
  'songloft-lynx-ios-nosign.ipa',
  'songloft-lynx-harmony.hap',
  'songloft-lynx-web-standalone.tar.gz',
  'songloft-lynx-web-embedded.tar.gz',
]
const assets = listReleaseAssets(directory)
if (
  assets.length !== expected.length ||
  expected.some((name) => !assets.some((asset) => asset.name === name))
)
  throw new Error('Release must contain exactly the five platform packages')
writeFileSync(
  resolve(directory, 'version.json'),
  JSON.stringify({ ...metadata, assets }, null, 2) + '\n',
)
const manifestHash = createHash('sha256')
  .update(readFileSync(resolve(directory, 'version.json')))
  .digest('hex')
writeFileSync(
  resolve(directory, 'checksums.txt'),
  [
    ...assets.map((asset) => `${asset.sha256}  ${asset.name}`),
    `${manifestHash}  version.json`,
  ].join('\n') + '\n',
)
console.log(
  `Verified ${assets.length} release assets; wrote version.json and checksums.txt`,
)
