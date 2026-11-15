import { afterEach, expect, test, vi } from 'vitest'

import { createApiClient } from '../../../core/network/api-client.js'
import { ApiError, HttpClient, type TransportRequest } from '../../../core/network/http-client.js'
import { TokenStore } from '../../../core/network/token-store.js'
import { createMemoryStorage } from '../../../core/storage/memory-storage.js'
import { setCachedAccessToken } from '../../../core/network/token-cache.js'
import { appConfig } from '../../../core/config/app-config.js'
import { importPlaylists, jsonMultipart, parseImportResult, PlaylistBackupApi } from '../domain/data-transfer.js'

const backup = JSON.stringify({ version: 1, playlists: [{ name: '歌单🎵', songs: [] }] })
const taggedBackup = JSON.stringify({
  version: 2,
  tags: [{ id: 17, name: '有声书🎵', color: '#123456' }],
  playlists: [{
    name: '故事集', type: 'normal', labels: ['audiobook'], tag_ids: [17],
    songs: [{ type: 'remote', title: '第一集', url: 'https://music.example/1.mp3', tag_ids: [17] }],
  }],
}, null, 2)
const counts = { playlists_created: 1, playlists_merged: 0, songs_created: 0, songs_matched: 0 }
const labels = { title: 'Import', choose: 'Choose', save: 'Save', cancel: 'Cancel' }

afterEach(() => {
  delete (globalThis as Record<string, unknown>).NativeModules
  delete (globalThis as Record<string, unknown>).SystemInfo
  setCachedAccessToken(null)
})

test.each(['', 'null', '{}', '[]', 'bad', '{"version":1,"playlists":{}}',
  '{"version":2,"playlists":null}', '{"version":3,"playlists":[]}', '{"version":"2","playlists":[]}'])(
  'rejects an empty or invalid backup before HTTP: %s', text => {
    expect(() => jsonMultipart(text)).toThrow('invalid_json')
  },
)

test.each([['v1', backup], ['v2', taggedBackup]])('imports %s backups without changing tags or text', async (_version, text) => {
  const transport = vi.fn(async (_request: TransportRequest) => ({ status: 200, headers: {}, body: JSON.stringify(counts) }))
  const api = new PlaylistBackupApi(new HttpClient({ transport }))
  expect(await api.importBackup(text)).toEqual(counts)
  expect(transport).toHaveBeenCalledTimes(1)
  const request = transport.mock.calls[0]![0]
  expect(request.url).toMatch(/\/api\/v1\/playlists\/import$/)
  expect(request.body).toContain(`\r\n\r\n${text}\r\n--`)
})

test.each([['v1', backup], ['v2', taggedBackup]])('exports %s backups without changing tags or text', async (_version, text) => {
  const client = new HttpClient({ transport: async () => ({ status: 200, headers: {}, body: text }) })
  expect(await new PlaylistBackupApi(client).exportBackup()).toBe(text)
})

test.each([{}, null, { ...counts, songs_created: -1 }, { ...counts, songs_matched: '0' }, { ...counts, playlists_created: 1.5 }])(
  'rejects invalid server counts', value => { expect(() => parseImportResult(value)).toThrow('invalid_response') },
)

test('multipart preserves Unicode, supplies the file field and avoids boundary collisions', () => {
  vi.spyOn(Date, 'now').mockReturnValue(1)
  vi.spyOn(Math, 'random').mockReturnValue(0)
  const text = JSON.stringify({ version: 1, playlists: [{ name: 'songloft-1- 中文🎵' }] })
  const encoded = jsonMultipart(text)
  const boundary = encoded.contentType.split('boundary=')[1]!
  expect(text).not.toContain(boundary)
  expect(encoded.body).toContain('name="file"; filename="songloft-backup.json"\r\n')
  expect(encoded.body).toContain(text)
  expect(encoded.body).toMatch(new RegExp(`--${boundary}--\\r\\n$`))
  vi.restoreAllMocks()
})

test.each([['v1', backup], ['v2', taggedBackup]])('%s imports and exports use Authorization, refresh once and replay the same multipart at a subpath', async (_version, text) => {
  const tokens = new TokenStore(createMemoryStorage().secure)
  await tokens.saveTokens({ accessToken: 'old', refreshToken: 'refresh', expiresIn: 3600, tokenType: 'Bearer' })
  const requests: TransportRequest[] = []
  const { client } = createApiClient({
    tokens, getBaseUrl: () => 'https://music.example', getBasePath: () => '/music',
    transport: async request => {
      requests.push({ ...request, headers: { ...request.headers } })
      if (request.url.endsWith('/auth/refresh')) return {
        status: 200, headers: {}, body: JSON.stringify({ access_token: 'new', refresh_token: 'next', expires_in: 3600, token_type: 'Bearer' }),
      }
      if (request.headers.Authorization !== 'Bearer new') return { status: 401, headers: {}, body: '{}' }
      return { status: 200, headers: {}, body: request.method === 'POST' ? JSON.stringify(counts) : text }
    },
  })
  const api = new PlaylistBackupApi(client)
  expect(await api.importBackup(text)).toEqual(counts)
  expect(await api.exportBackup()).toBe(text)
  expect(requests.filter(request => request.url.endsWith('/auth/refresh'))).toHaveLength(1)
  const posts = requests.filter(request => request.url.endsWith('/playlists/import'))
  expect(posts).toHaveLength(2)
  expect(posts[0]!.body).toBe(posts[1]!.body)
  expect(posts[1]!.headers['Content-Type']).toMatch(/^multipart\/form-data; boundary=/)
  expect(posts[1]!.headers.Authorization).toBe('Bearer new')
  expect(requests.every(request => request.url.startsWith('https://music.example/music/api/v1/'))).toBe(true)
  expect(requests.every(request => !request.url.includes('access_token'))).toBe(true)
})

test('HTTP failures propagate and successful HTML responses cannot become backups', async () => {
  const client = new HttpClient({ transport: async () => ({ status: 500, headers: {}, body: '{}' }) })
  await expect(new PlaylistBackupApi(client).importBackup(backup)).rejects.toBeInstanceOf(ApiError)
  const html = new HttpClient({ transport: async () => ({ status: 200, headers: {}, body: '<html>error</html>' }) })
  await expect(new PlaylistBackupApi(html).exportBackup()).rejects.toThrow('invalid_json')
})

test('closing the data page or changing sessions while choosing a file prevents an upload', async () => {
  const savedBase = appConfig.baseUrl
  let chosen!: (error: null, text: string) => void
  ;(globalThis as Record<string, unknown>).SystemInfo = { platform: 'web' }
  ;(globalThis as Record<string, unknown>).NativeModules = { SongloftPlatform: {
    pickTextFile: (_options: unknown, callback: typeof chosen) => { chosen = callback },
    saveTextFile() {}, cancelTextFile() {},
  } }
  setCachedAccessToken('one')
  const closed = importPlaylists({ labels, isActive: () => false })
  chosen(null, backup)
  await expect(closed).rejects.toThrow('cancelled')
  const switched = importPlaylists({ labels })
  setCachedAccessToken('two')
  chosen(null, backup)
  await expect(switched).rejects.toThrow('session_changed')
  expect(appConfig.baseUrl).toBe(savedBase)
})
