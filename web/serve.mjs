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
import { readFileSync, statSync, existsSync, readdirSync } from 'node:fs'
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
  const pnpmDir = resolve(repoRoot, 'node_modules', '.pnpm')
  if (!existsSync(pnpmDir)) return null

  const prodMatch = readdirSync(pnpmDir).find(e => e.startsWith('@lynx-js+web-core@'))
  if (prodMatch) {
    const p = resolve(pnpmDir, prodMatch, 'node_modules', '@lynx-js', 'web-core', 'dist', 'client_prod', 'static')
    if (existsSync(p)) return p
  }

  return null
}

const WEB_CORE_PATH = findWebCorePath()
if (!WEB_CORE_PATH) {
  console.error('[serve] Could not find @lynx-js/web-core assets.')
  console.error('[serve] Make sure `pnpm install` has been run.')
  process.exit(1)
}

console.log(`[serve] Using web-core bundle at ${WEB_CORE_PATH}`)

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

// File cache (for development, simple in-memory cache)
const cache = new Map()

function serveFile(res, filePath, mime) {
  try {
    if (!existsSync(filePath)) {
      res.writeHead(404, { 'Content-Type': 'text/plain' })
      res.end('Not found')
      return
    }

    const isBinary = mime === 'application/wasm' || mime.startsWith('application/octet-stream')
    let content
    const cacheKey = filePath + (isBinary ? ':binary' : ':text')
    if (cache.has(cacheKey)) {
      content = cache.get(cacheKey)
    } else {
      content = isBinary ? readFileSync(filePath) : readFileSync(filePath, 'utf-8')
      // In production, replace the mocked localhost URL with the actual path
      // (the web-core dev bundle has a hardcoded http://lynx-web-core-mocked.localhost/)
      if (typeof content === 'string') {
        content = content.replaceAll('http://lynx-web-core-mocked.localhost/', '/web-core/')
      }
      cache.set(cacheKey, content)
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

  // Route: / → index.html
  if (url === '/') {
    return serveFile(res, resolve(__dirname, 'index.html'), 'text/html; charset=utf-8')
  }

  // Route: /main.lynx.bundle → the Lynx web bundle
  if (url === '/main.lynx.bundle') {
    return serveFile(res, BUNDLE_PATH, 'application/octet-stream')
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
  // (audio-host.js, songloft-platform-module.js, songloft-audio-module.js)
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