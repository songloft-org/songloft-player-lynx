import { createHash } from 'node:crypto'
import { readFile, lstat } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { assertTarget, compatibility } from '../target.mjs'
const sdk = resolve(process.env.SONGLOFT_DESKTOP_SDK ?? '')
const raw = await readFile(join(sdk, 'sdk.json'))
if (
  createHash('sha256').update(raw).digest('hex') !==
  process.env.SONGLOFT_DESKTOP_SDK_SHA256
)
  throw new Error('SDK manifest digest rejected')
const manifest = JSON.parse(raw)
if (
  manifest.target !== assertTarget() ||
  manifest.mpv?.commit !== compatibility.libmpv.sourceCommit ||
  manifest.mpv?.version !== compatibility.libmpv.version ||
  manifest.ffmpeg?.version !== compatibility.ffmpeg ||
  manifest.ffmpeg?.commit !== compatibility.ffmpegCommit
)
  throw new Error('SDK target/version rejected')
for (const file of [...manifest.files, ...manifest.buildFiles]) {
  if (
    !/^(?:native\/lib|tools|build\/(?:include\/mpv|lib))\/[a-zA-Z0-9._+-]+$/.test(
      file.path,
    ) ||
    !/^[a-f0-9]{64}$/.test(file.sha256)
  )
    throw new Error('Invalid SDK entry')
  const path = join(sdk, file.path)
  if (
    !(await lstat(path)).isFile() ||
    createHash('sha256')
      .update(await readFile(path))
      .digest('hex') !== file.sha256
  )
    throw new Error('SDK file rejected')
}
console.log(`Verified ${manifest.target} SDK and build inputs`)
