/**
 * Development HTTP server for the Songloft Lynx Web preview.
 *
 * Serves:
 *  - / …………………………… web/index.html
 *  - /main.lynx.bundle ……… dist/main.lynx.bundle (Lynx bundle)
 *  - /web-core/static/* ……… @lynx-js/web-core production assets
 *
 * Usage:
 *   1. Build the bundle: pnpm build
 *   2. Start the server: node web/serve.mjs
 *   3. Open http://localhost:3000
 *
 * The server sets Cross-Origin-Isolate headers (COOP/COEP) so that the
 * web-core engine can use SharedArrayBuffer.
 */

import { createServer } from 'node:http'
import { readFileSync, statSync, existsSync, readdirSync, realpathSync } from 'node:fs'
import { extname, resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '..')

const PORT = process.env.PORT ?? 3000

// Path to the Lynx web bundle (built with `rspeedy build --environment web`).
const BUNDLE_PATH = resolve(repoRoot, 'dist', 'web', 'main.web.bundle')

// Resolve @lynx-js/web-core assets — the SAME set `scripts/copy-bundle-web.mjs`
// ships (client_prod/), on purpose.
//
// This used to prefer the dev-middleware copy (www/static). The two sets are
// structurally identical — same async chunks, same wasm hashes, same 0.23.1 —
// and differ only in the entry filename (index.js vs client.js). That single
// difference meant `web:dev` and `build:web` loaded different files, so a
// black-screen bug in the deployable output (index.html referenced the dev-only
// names, which `build:web` never copies) stayed invisible through every local
// check. Serving exactly what we ship makes that divergence impossible.
function findWebCorePath() {
  // Resolve through the symlink pnpm maintains at node_modules/@lynx-js/web-core.
  // Scanning .pnpm for the first `@lynx-js+web-core@…` match instead grabs
  // whichever patch-hash directory happens to be listed first — after a patch
  // update several coexist, and the scan silently serves a stale (unpatched)
  // copy while the symlink points elsewhere.
  const link = resolve(repoRoot, 'node_modules', '@lynx-js', 'web-core')
  if (!existsSync(link)) return null

  const staticDir = resolve(realpathSync(link), 'dist', 'client_prod', 'static')
  return existsSync(staticDir) ? staticDir : null
}

const WEB_CORE_PATH = findWebCorePath()
if (!WEB_CORE_PATH) {
  console.error('[serve] Could not find @lynx-js/web-core assets.')
  console.error('[serve] Make sure `pnpm install` has been run.')
  process.exit(1)
}

console.log(`[serve] Using web-core bundle at ${WEB_CORE_PATH}`)

/**
 * Rewrite the WASM preload hints to the filenames that actually exist.
 *
 * The hashes in `index.html` are a template — they go stale on every web-core
 * upgrade, and a preload pointing at a 404 is worse than none (it costs a
 * request and still leaves the real fetch cold). Discovering them from the
 * shipped `wasm/` directory keeps dev and `build:web` agreeing without anyone
 * having to remember. `copy-bundle-web.mjs` does the same for the deployed copy.
 *
 * Deliberately emits NO `crossorigin` attribute — see the comment on those
 * `<link>` tags in index.html: it would flip the preload's credentials mode to
 * `omit` and stop web-core's bare `fetch()` from ever reusing the entry.
 */
const wasmPreload = (f) => `<link rel="preload" as="fetch" href="/web-core/static/wasm/${f}">`

function buildIndexHtml() {
  const raw = readFileSync(resolve(__dirname, 'index.html'), 'utf-8')
  const wasmDir = resolve(WEB_CORE_PATH, 'wasm')
  const wasmFiles = existsSync(wasmDir)
    ? readdirSync(wasmDir).filter(f => f.endsWith('.module.wasm'))
    : []

  let wasmIdx = 0
  let result = raw.replace(
    /<link rel="preload" as="fetch" href="\/web-core\/static\/wasm\/[^"]+\.module\.wasm"[^>]*>/g,
    () => {
      const f = wasmFiles[wasmIdx++]
      // Fewer files than slots: drop the surplus tag rather than leave a 404.
      return f ? wasmPreload(f) : ''
    }
  )
  // More files than slots (a web-core upgrade added one): give each a tag.
  for (let i = wasmIdx; i < wasmFiles.length; i++) {
    result = result.replace(
      /(<link href="\/web-core\/static\/css\/client\.css" rel="stylesheet">)/,
      `$1\n  ${wasmPreload(wasmFiles[i])}`
    )
  }
  return result
}

// MIME type map
const MIME = {
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.wasm': 'application/wasm',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.bundle': 'application/octet-stream',
}

/*
 * File cache, keyed by path and invalidated by mtime+size.
 *
 * The mtime check is not an optimisation detail — without it this server holds
 * the first bytes it ever read until the process exits, while cheerfully sending
 * `Cache-Control: no-cache`. A `web:sync` after a code change then leaves the
 * browser on the previous bundle, and a Web verification session silently
 * validates stale code: the symptom is a fix that "did not work" plus a
 * Content-Length that disagrees with the file on disk.
 */
const cache = new Map()

function serveFile(res, filePath, mime) {
  try {
    if (!existsSync(filePath)) {
      res.writeHead(404, { 'Content-Type': 'text/plain' })
      res.end('Not found')
      return
    }

    // Binary files must be read as raw buffers; reading them as utf-8
    // corrupts the bytes (e.g. PNG images, WASM, ICO, .bundle).
    const isBinary = mime === 'application/wasm'
      || mime.startsWith('application/octet-stream')
      || mime.startsWith('image/')
    let content
    const { mtimeMs, size } = statSync(filePath)
    const stamp = `${isBinary ? 'binary' : 'text'}:${mtimeMs}:${size}`
    const hit = cache.get(filePath)
    if (hit && hit.stamp === stamp) {
      content = hit.content
    } else {
      content = isBinary ? readFileSync(filePath) : readFileSync(filePath, 'utf-8')
      // In production, replace the mocked localhost URL with the actual path
      // (the web-core dev bundle has a hardcoded http://lynx-web-core-mocked.localhost/)
      if (typeof content === 'string') {
        content = content.replaceAll('http://lynx-web-core-mocked.localhost/', '/web-core/')
      }
      cache.set(filePath, { stamp, content })
    }

    res.writeHead(200, {
      'Content-Type': mime,
      'Content-Length': Buffer.byteLength(content),
      // Required for SharedArrayBuffer (used by web-core's WASM engine)
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
      // Cache control for development
      'Cache-Control': 'no-cache',
    })
    res.end(content)
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'text/plain' })
    res.end('Internal server error: ' + err.message)
  }
}

const server = createServer((req, res) => {
  const url = req.url ?? '/'

  // Route: / → index.html (with dynamically injected WASM preloads)
  if (url === '/') {
    try {
      const html = buildIndexHtml()
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Length': Buffer.byteLength(html),
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'require-corp',
        'Cache-Control': 'no-cache',
      })
      res.end(html)
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'text/plain' })
      res.end('Internal server error: ' + err.message)
    }
    return
  }

  // Route: /main.lynx.bundle → the Lynx web bundle
  if (url === '/main.lynx.bundle') {
    return serveFile(res, BUNDLE_PATH, 'application/octet-stream')
  }

  // Route: /demo-plugin.web.bundle → child frame demo bundle (Phase 0 验证)
  if (url === '/demo-plugin.web.bundle') {
    const demoBundle = resolve(repoRoot, 'demo-frame-plugin', 'dist', 'web', 'main.web.bundle')
    return serveFile(res, demoBundle, 'application/octet-stream')
  }

  // Route: /web-core/static/* → @lynx-js/web-core production assets
  const WEB_CORE_PREFIX = '/web-core/static/'
  if (url.startsWith(WEB_CORE_PREFIX)) {
    const relativePath = url.slice(WEB_CORE_PREFIX.length)
    const filePath = resolve(WEB_CORE_PATH, relativePath)
    const ext = extname(filePath)
    const mime = MIME[ext] ?? 'application/octet-stream'
    return serveFile(res, filePath, mime)
  }

  // Route: /favicon.ico → silent 204 (no favicon needed)
  if (url === '/favicon.ico') {
    res.writeHead(204).end()
    return
  }

  // Route: root-level static files from the web/ source directory
  // (audio-host.js, webview-host.js, songloft-*-module.js, …)
  {
    const requested = url.slice(1) // strip leading /
    // Only serve top-level files; reject paths that would escape the directory.
    if (requested && !requested.includes('/') && !requested.includes('\\')) {
      const filePath = resolve(__dirname, requested)
      // Safety: ensure the resolved path is still directly under __dirname
      if (filePath.startsWith(__dirname + '/') && existsSync(filePath)) {
        const ext = extname(filePath)
        const mime = MIME[ext] ?? 'application/octet-stream'
        return serveFile(res, filePath, mime)
      }
    }
  }

  // Fallback: 404
  res.writeHead(404, { 'Content-Type': 'text/plain' })
  res.end('Not found')
})

server.listen(PORT, () => {
  console.log(`\n  Songloft Web Dev Server\n`)
  console.log(`  ➜  http://localhost:${PORT}/\n`)
  console.log(`  (COOP/COEP headers enabled for SharedArrayBuffer)\n`)
})
