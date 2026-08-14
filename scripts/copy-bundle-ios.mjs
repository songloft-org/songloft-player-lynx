/**
 * Copy the built Lynx bundle into the iOS host's resources so the .app can load
 * it offline (no dev server, no LynxExplorer).
 *
 *   dist/main.lynx.bundle  →  ios/SongloftLynx/main.lynx.bundle
 *
 * The file is referenced by the Xcode target's Resources build phase, so it ends
 * up inside `SongloftLynx.app/` and `SongloftTemplateProvider` finds it via
 * `Bundle.main.path(forResource: "main.lynx", ofType: "bundle")`.
 *
 * Run AFTER `pnpm run build`. The destination is gitignored — it is a build
 * artifact produced fresh from `dist/` (mirrors copy-bundle-android.mjs).
 *
 * Usage: `node scripts/copy-bundle-ios.mjs`
 */
import { copyFileSync, mkdirSync, statSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { assertBundleFresh } from './assert-bundle-fresh.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '..')

const SRC = resolve(repoRoot, 'dist', 'main.lynx.bundle')
const DEST = resolve(repoRoot, 'ios', 'SongloftLynx', 'main.lynx.bundle')

// Existence is not enough — a stale bundle also exists. See the helper's header.
assertBundleFresh(SRC, 'copy-bundle-ios')

mkdirSync(dirname(DEST), { recursive: true })
copyFileSync(SRC, DEST)

const { size } = statSync(DEST)
console.log(`[copy-bundle-ios] Copied bundle → ${DEST} (${(size / 1024).toFixed(1)} kB)`)
