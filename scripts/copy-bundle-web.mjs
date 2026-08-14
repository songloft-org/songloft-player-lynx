/**
 * Copy the built Lynx bundle and web-core assets into the web/ directory for
 * production deployment.
 *
 *   dist/main.lynx.bundle  →  web/dist/main.lynx.bundle
 *   web-core/static/*      →  web/dist/web-core/static/*
 *
 * In `--embedded` mode, the output is structured for embedding into the Go
 * backend (songloft-player-build/web-embedded/).
 *
 * Usage:
 *   node scripts/copy-bundle-web.mjs           # standalone web deployment
 *   node scripts/copy-bundle-web.mjs --embedded # embedded Go backend
 */
import { copyFileSync, mkdirSync, existsSync, readdirSync, rmSync, statSync, cpSync } from 'node:fs'
import { dirname, resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '..')
const isEmbedded = process.argv.includes('--embedded')

const DEST_BASE = isEmbedded
  ? resolve(repoRoot, '..', 'songloft-player-build', 'web-embedded')
  : resolve(repoRoot, 'web', 'dist')

const SRC_BUNDLE = resolve(repoRoot, 'dist', 'web', 'main.web.bundle')

// Resolve @lynx-js/web-core production assets
function findWebCoreStatic() {
  const pnpmDir = resolve(repoRoot, 'node_modules', '.pnpm')
  if (!existsSync(pnpmDir)) return null
  const entries = readdirSync(pnpmDir)
  const match = entries.find(e => e.startsWith('@lynx-js+web-core@'))
  if (!match) return null
  const p = resolve(pnpmDir, match, 'node_modules', '@lynx-js', 'web-core', 'dist', 'client_prod', 'static')
  return existsSync(p) ? p : null
}

if (!existsSync(SRC_BUNDLE)) {
  console.error(
    `[copy-bundle-web] Missing ${SRC_BUNDLE}\n` +
      `Run \`pnpm run build\` first so the Lynx bundle exists.`,
  )
  process.exit(1)
}

const webCoreStatic = findWebCoreStatic()
if (!webCoreStatic) {
  console.error('[copy-bundle-web] Could not find @lynx-js/web-core production assets.')
  process.exit(1)
}

// Copy bundle
const bundleDest = resolve(DEST_BASE, 'main.lynx.bundle')
mkdirSync(dirname(bundleDest), { recursive: true })
copyFileSync(SRC_BUNDLE, bundleDest)

// Copy web-core static assets
const webCoreDest = resolve(DEST_BASE, 'web-core', 'static')
mkdirSync(webCoreDest, { recursive: true })
cpSync(webCoreStatic, webCoreDest, { recursive: true })

// Copy HTML host page. The same index.html serves both standalone and embedded
// modes — the app auto-detects the Web platform via `self.location.origin` and
// hides the server-address UI accordingly.
//
// For embedded, wipe the target directory first so stale files from a previous
// build (e.g. canvaskit/ from the old Flutter app) don't linger in the Go binary.
if (isEmbedded && existsSync(DEST_BASE)) {
  rmSync(DEST_BASE, { recursive: true, force: true })
}
const htmlSrc = resolve(repoRoot, 'web', 'index.html')
const htmlDest = resolve(DEST_BASE, 'index.html')
if (existsSync(htmlSrc)) {
  mkdirSync(dirname(htmlDest), { recursive: true })
  copyFileSync(htmlSrc, htmlDest)
}

// Copy audio-host.js (main-thread audio adapter registered as a native module).
const audioHostSrc = resolve(repoRoot, 'web', 'audio-host.js')
const audioHostDest = resolve(DEST_BASE, 'audio-host.js')
if (existsSync(audioHostSrc)) {
  copyFileSync(audioHostSrc, audioHostDest)
}

console.log(`[copy-bundle-web] Deployed to ${DEST_BASE}`)
console.log(`  ├── main.lynx.bundle (${(statSync(bundleDest).size / 1024).toFixed(1)} kB)`)
console.log(`  └── web-core/static/ (${countFiles(webCoreDest)} files)`)

function countFiles(dir) {
  if (!existsSync(dir)) return 0
  let count = 0
  for (const entry of readdirSync(dir, { recursive: true, encoding: 'utf-8' })) {
    const full = join(dir, entry)
    if (statSync(full).isFile()) count++
  }
  return count
}