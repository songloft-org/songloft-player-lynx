import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PORT = Number(process.env.E2E_API_PORT ?? 58091)
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

  if (method === 'GET' && url.startsWith('/api/v1/songs/stats')) {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({
      songCount: 5, albumCount: 2, artistCount: 2,
      totalDuration: 15, totalSize: 240000,
      genreCount: 1, yearCount: 1,
    }))
    return
  }

  if (method === 'GET' && url.startsWith('/api/v1/songs/facets')) {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({
      facets: [
        { value: 'Test Artist', count: 3 },
        { value: 'Another Artist', count: 2 },
      ],
      total: 2,
    }))
    return
  }

  if (method === 'GET' && url.match(/^\/api\/v1\/songs\/\d+$/)) {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({
      id: 1, type: 'local', title: 'E2E Song One', artist: 'Test Artist',
      album: 'Test Album', year: 2024, duration: 3, file_size: 48000,
      bit_rate: 128000, sample_rate: 44100, format: 'mp3',
      url: '/api/v1/songs/1/stream', is_live: false, is_video: false,
      added_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-01T00:00:00Z',
    }))
    return
  }

  if (method === 'GET' && url.match(/^\/api\/v1\/songs\/\d+\/lyric/)) {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({
      lyrics: '[00:00.00]Test Lyrics Line 1\n[00:01.50]Test Lyrics Line 2\n[00:03.00]End',
      translation: '',
    }))
    return
  }

  if (method === 'GET' && url.match(/^\/api\/v1\/playlists(\?|$)/)) {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({
      items: [
        { id: 1, name: 'Favorites', song_count: 2, is_smart: false, is_hidden: false, created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-01T00:00:00Z' },
        { id: 2, name: 'Chill Mix', song_count: 3, is_smart: false, is_hidden: false, created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-01T00:00:00Z' },
      ],
      total: 2,
    }))
    return
  }

  if (method === 'GET' && url.match(/^\/api\/v1\/playlists\/\d+$/)) {
    const id = url.match(/\/playlists\/(\d+)/)?.[1] ?? '1'
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({
      id: Number(id), name: id === '1' ? 'Favorites' : 'Chill Mix',
      song_count: 3, is_smart: false, is_hidden: false,
      created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-01T00:00:00Z',
    }))
    return
  }

  if (method === 'GET' && url.match(/^\/api\/v1\/playlists\/\d+\/songs/)) {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(songsResponse)
    return
  }

  if (method === 'GET' && url.match(/^\/api\/v1\/playlists\/\d+\/song-ids/)) {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ids: [1, 2, 3], total: 3 }))
    return
  }

  if (method === 'POST' && url.match(/^\/api\/v1\/playlists$/)) {
    res.writeHead(201, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({
      id: 99, name: 'New Playlist', song_count: 0, is_smart: false, is_hidden: false,
      created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-01T00:00:00Z',
    }))
    return
  }

  if (method === 'PUT' && url.match(/^\/api\/v1\/playlists\/\d+$/)) {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({
      id: 2, name: 'Updated Name', song_count: 3, is_smart: false, is_hidden: false,
      created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-01T00:00:00Z',
    }))
    return
  }

  if (method === 'DELETE' && url.match(/^\/api\/v1\/playlists\/\d+$/)) {
    res.writeHead(204)
    res.end()
    return
  }

  if (method === 'POST' && url.match(/^\/api\/v1\/playlists\/\d+\/songs$/)) {
    res.writeHead(204)
    res.end()
    return
  }

  if (method === 'DELETE' && url.match(/^\/api\/v1\/playlists\/\d+\/songs\/\d+/)) {
    res.writeHead(204)
    res.end()
    return
  }

  if (method === 'PUT' && url.match(/^\/api\/v1\/playlists\/\d+\/visibility/)) {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({
      id: 2, name: 'Chill Mix', song_count: 3, is_smart: false, is_hidden: true,
      created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-01T00:00:00Z',
    }))
    return
  }

  if (method === 'GET' && url.startsWith('/api/v1/cache-manage/stats')) {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ totalSize: 1024000, fileCount: 10 }))
    return
  }

  if (method === 'POST' && url.startsWith('/api/v1/cache-manage/clean')) {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ totalSize: 0, fileCount: 0 }))
    return
  }

  if (method === 'POST' && url.startsWith('/api/v1/auth/logout')) {
    res.writeHead(204)
    res.end()
    return
  }

  if (method === 'POST' && url.startsWith('/api/v1/auth/refresh')) {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ access_token: 'refreshed-token', refresh_token: 'refresh-tok' }))
    return
  }

  if (method === 'GET' && url.startsWith('/api/v1/health')) {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ status: 'ok' }))
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
        console.log(`[e2e] Port ${PORT} already in use — using external server (not mock). Set E2E_API_PORT to use a different port.`)
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
