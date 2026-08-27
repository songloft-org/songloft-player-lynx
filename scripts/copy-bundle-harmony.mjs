/**
 * Copy the Lynx native bundle to the HarmonyOS rawfile directory.
 *
 * Same pattern as copy-bundle.mjs (Android) — reads from dist/main.lynx.bundle
 * and places it where the HarmonyOS entry module's resourceManager can find it.
 */
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')

const src = resolve(root, 'dist/main.lynx.bundle')
const dest = resolve(root, 'harmony/entry/src/main/resources/rawfile/main.lynx.bundle')

if (!existsSync(src)) {
  console.error('❌ dist/main.lynx.bundle not found. Run `pnpm run build` first.')
  process.exit(1)
}

const destDir = dirname(dest)
if (!existsSync(destDir)) {
  mkdirSync(destDir, { recursive: true })
}

copyFileSync(src, dest)
console.log(`✅ Copied bundle to harmony/entry/src/main/resources/rawfile/main.lynx.bundle`)
