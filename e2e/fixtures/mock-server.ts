import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PORT = 58091
const FIXTURES = resolve(__dirname, '.')

const loginResponse = readFileSync(resolve(FIXTURES, 'responses/login.json'))
const songsResponse = readFileSync(resolve(FIXTURES, 'responses/songs.json'))

// 3-second silence MP3 — minimal valid MP3 frame (128kbps, 44100Hz)
let silenceMp3: Buffer
try {
  silenceMp3 = readFileSync(resolve(FIXTURES, 'songs/silence-3s.mp3'))
} catch {
  // Generate a minimal MP3 frame header as fallback
  silenceMp3 = Buffer.alloc(48000, 0)
  silenceMp3[0] = 0xff
  silenceMp3[1] = 0xfb
  silenceMp3[2] = 0x90
  silenceMp3[3] = 0x00
}

function handleRequest(req: IncomingMessage, res: ServerResponse): void {
  const url = req.url ?? ''
  const method = req.method ?? 'GET'

  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')

  if (method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  if (method === 'POST' && url.startsWith('/api/v1/auth/login')) {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(loginResponse)
    return
  }

  if (method === 'GET' && url.match(/^\/api\/v1\/songs(\?|$)/)) {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(songsResponse)
    return
  }

  if (method === 'GET' && url.match(/^\/api\/v1\/songs\/\d+\/stream/)) {
    res.writeHead(200, {
      'Content-Type': 'audio/mpeg',
      'Content-Length': String(silenceMp3.length),
    })
    res.end(silenceMp3)
    return
  }

  if (method === 'GET' && url.startsWith('/api/v1/auth/check')) {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ valid: true }))
    return
  }

  if (method === 'GET' && url.startsWith('/api/v1/server/info')) {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ version: '1.0.0-e2e', mode: 'standalone' }))
    return
  }

  res.writeHead(404, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ error: 'not found', path: url }))
}

let server: ReturnType<typeof createServer> | null = null

export function startMockServer(): Promise<void> {
  return new Promise((resolve, reject) => {
    server = createServer(handleRequest)
    server.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        console.log(`[e2e] Port ${PORT} already in use — assuming mock server is running`)
        server = null
        resolve()
      } else {
        reject(err)
      }
    })
    server.listen(PORT, '0.0.0.0', () => {
      console.log(`[e2e] Mock server listening on :${PORT}`)
      resolve()
    })
  })
}

export function stopMockServer(): Promise<void> {
  return new Promise((resolve) => {
    if (server) {
      server.close(() => resolve())
      server = null
    } else {
      resolve()
    }
  })
}
