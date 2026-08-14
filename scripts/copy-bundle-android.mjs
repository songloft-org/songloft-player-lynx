/**
 * Copy the built Lynx bundle into the Android host's assets so the APK can load
 * it offline (no dev server, no LynxExplorer).
 *
 *   dist/main.lynx.bundle  →  android/app/src/main/assets/main.lynx.bundle
 *
 * Run AFTER `pnpm run build`. The destination is gitignored — it is a build
 * artifact produced fresh in CI (and locally) from `dist/`.
 *
 * Usage: `node scripts/copy-bundle-android.mjs`
 */
import { copyFileSync, mkdirSync, statSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { assertBundleFresh } from './assert-bundle-fresh.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '..')

const SRC = resolve(repoRoot, 'dist', 'main.lynx.bundle')
const DEST = resolve(repoRoot, 'android', 'app', 'src', 'main', 'assets', 'main.lynx.bundle')

// Existence is not enough — a stale bundle also exists. See the helper's header.
assertBundleFresh(SRC, 'copy-bundle-android')

mkdirSync(dirname(DEST), { recursive: true })
copyFileSync(SRC, DEST)

const { size } = statSync(DEST)
console.log(
  `[copy-bundle-android] Copied bundle → ${DEST} (${(size / 1024).toFixed(1)} kB)`,
)
