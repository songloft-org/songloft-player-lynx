import { execFileSync } from 'node:child_process'
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createBuildMetadata } from './release-lib.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const version = JSON.parse(
  readFileSync(resolve(root, 'package.json'), 'utf8'),
).version
const metadata = createBuildMetadata({
  packageVersion: version,
  ref: process.env.GITHUB_REF ?? '',
  sha:
    process.env.GITHUB_SHA ??
    execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: root,
      encoding: 'utf8',
    }).trim(),
})
mkdirSync(resolve(root, '.build'), { recursive: true })
writeFileSync(
  resolve(root, '.build/version.json'),
  JSON.stringify(metadata, null, 2) + '\n',
)
if (process.env.GITHUB_OUTPUT) {
  for (const [key, value] of Object.entries(metadata))
    appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`)
}
console.log(JSON.stringify(metadata, null, 2))
