import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { validateBuildMetadata } from './release-lib.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const packageVersion = JSON.parse(
  readFileSync(resolve(root, 'package.json'), 'utf8'),
).version
const metadata = validateBuildMetadata(
  JSON.parse(
    readFileSync(
      process.env.SONGLOFT_BUILD_METADATA ??
        resolve(root, '.build/version.json'),
      'utf8',
    ),
  ),
  packageVersion,
)
const appPath = resolve(root, 'harmony/AppScope/app.json5')
const profilePath = resolve(root, 'harmony/build-profile.json5')
const app = JSON.parse(readFileSync(appPath, 'utf8'))
app.app.versionName =
  metadata.version === 'dev'
    ? `${metadata.native_version}-dev`
    : metadata.version
app.app.versionCode = metadata.build_number
writeFileSync(appPath, JSON.stringify(app, null, 2) + '\n')
const profile = JSON.parse(readFileSync(profilePath, 'utf8'))
profile.app.signingConfigs = []
for (const product of profile.app.products) delete product.signingConfig
writeFileSync(profilePath, JSON.stringify(profile, null, 2) + '\n')
