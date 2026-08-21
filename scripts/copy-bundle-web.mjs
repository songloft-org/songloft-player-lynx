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
import { copyFileSync, mkdirSync, existsSync, readdirSync, rmSync, statSync, cpSync, readFileSync, writeFileSync } from 'node:fs'
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
// modes, differing in the `deployMode` globalProp: the source page carries
// `deployMode: 'standalone'` (right for the static server this script's default
// mode deploys to), and the embedded pass below strips it — there the backend
// IS the page origin, so the app's same-origin probe is correct.
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

  if (isEmbedded) {
    // Strip the standalone deploy-mode attribute so the worker falls back to
    // its same-origin probe. Left in, an embedded page would show the
    // API-address field and default the base URL to the dev backend instead of
    // the very server serving it. The documenting comment above the element
    // stays — it explains the mechanism for both builds.
    const TAG = `global-props='{"deployMode":"standalone"}'`
    let html = readFileSync(htmlDest, 'utf-8')
    const tagIdx = html.indexOf(TAG)
    if (tagIdx === -1) {
      throw new Error(
        '[copy-bundle-web] the standalone global-props tag is missing from index.html '
          + '— check the <lynx-view> element in web/index.html.',
      )
    }
    html = html.slice(0, tagIdx) + html.slice(tagIdx + TAG.length)
    writeFileSync(htmlDest, html, 'utf-8')
    console.log('  ├── deployMode tag stripped (embedded build)')
  }

  // Rewrite WASM preload hints to match the actual hashed filenames in the
  // web-core build. The hashes in the source HTML are a template — they go stale
  // on every web-core upgrade, and a preload pointing at a 404 costs a request
  // while still leaving the real fetch cold. `web/serve.mjs` does the same for
  // dev, so both paths reference files that exist.
  //
  // No `crossorigin` attribute is emitted, on purpose: see the comment on those
  // <link> tags in web/index.html. It would set the preload's credentials mode to
  // `omit` while web-core fetches with a bare `fetch()` (`same-origin`), so the
  // entry is never reused and every asset downloads twice.
  const wasmDir = resolve(webCoreStatic, 'wasm')
  const wasmFiles = existsSync(wasmDir)
    ? readdirSync(wasmDir).filter(f => f.endsWith('.module.wasm'))
    : []
  if (wasmFiles.length > 0) {
    const tag = (f) => `<link rel="preload" as="fetch" href="/web-core/static/wasm/${f}">`
    const remaining = [...wasmFiles]
    let html = readFileSync(htmlDest, 'utf-8')
    html = html.replace(
      /<link rel="preload" as="fetch" href="\/web-core\/static\/wasm\/[^"]+\.module\.wasm"[^>]*>/g,
      () => {
        const f = remaining.shift()
        return f ? tag(f) : '' // fewer files than slots → drop the surplus tag
      },
    )
    // More files than slots (an upgrade added one): give each its own tag.
    for (const f of remaining) {
      html = html.replace(
        /(<link href="\/web-core\/static\/css\/client\.css" rel="stylesheet">)/,
        `$1\n  ${tag(f)}`,
      )
    }
    writeFileSync(htmlDest, html, 'utf-8')
    console.log(`  ├── WASM preload hints updated (${wasmFiles.join(', ')})`)
  }
}

/*
 * Copy the main-thread host scripts.
 *
 * The `songloft-*-module.js` files are not optional decoration: `nativeModulesMap`
 * points the background worker at those **URLs**, so if one is missing from the
 * deployed product the import rejects and `NativeModules` loses every custom
 * module. A `web:sync` that forgets them looks fine and breaks the file picker,
 * the clipboard, audio — anything on those modules.
 */
const HOST_SCRIPTS = [
  'app_icon.png',
  'audio-host.js',
  'hls.min.js',
  'songloft-platform-module.js',
  'songloft-audio-module.js',
  'songloft-navigation-module.js',
]
for (const name of HOST_SCRIPTS) {
  const src = resolve(repoRoot, 'web', name)
  if (!existsSync(src)) throw new Error(`[copy-bundle-web] missing host script: ${name}`)
  copyFileSync(src, resolve(DEST_BASE, name))
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
