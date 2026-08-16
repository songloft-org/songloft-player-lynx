const API_BASE = process.env.E2E_API_BASE ?? 'http://localhost:58091'

let cachedToken: string | null = null
let cachedSongs: any[] | null = null

export async function getToken(): Promise<string> {
  if (cachedToken) return cachedToken
  const res = await fetch(`${API_BASE}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin' }),
  })
  const data = (await res.json()) as any
  cachedToken = data.access_token
  return cachedToken!
}

export async function fetchRealSongs(limit = 5): Promise<any[]> {
  if (cachedSongs && cachedSongs.length >= limit) return cachedSongs.slice(0, limit)
  const token = await getToken()
  const res = await fetch(`${API_BASE}/api/v1/songs?limit=${limit}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const data = (await res.json()) as any
  cachedSongs = data.songs || data.items || data
  return cachedSongs!.slice(0, limit)
}

/**
 * A song the server marked as carrying a real video track, or `null` if the library
 * has none.
 *
 * Returned in the **camelCase** shape the player store consumes, because scenarios
 * hand it straight to `playPlaylist` — the store never sees the wire format (that
 * transform lives in `models/song.ts`, on the app side of the bridge).
 */
export async function fetchVideoSong(): Promise<Record<string, unknown> | null> {
  const token = await getToken()
  const res = await fetch(`${API_BASE}/api/v1/songs?limit=200`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const data = (await res.json()) as any
  const raw = (data.songs || data.items || data || []).find((s: any) => s.is_video === true)
  if (!raw) return null
  return {
    id: raw.id,
    type: raw.type ?? 'local',
    title: raw.title ?? '',
    artist: raw.artist ?? '',
    album: raw.album ?? '',
    format: raw.format ?? '',
    duration: raw.duration ?? 0,
    url: raw.url ?? `/api/v1/songs/${raw.id}/play`,
    isVideo: true,
    isLive: raw.is_live ?? false,
    year: 0,
    fileSize: 0,
    bitRate: 0,
    sampleRate: 0,
    addedAt: '',
    updatedAt: '',
  }
}
