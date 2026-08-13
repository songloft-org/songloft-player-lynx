const API_BASE = 'http://localhost:58091'

let cachedToken: string | null = null
let cachedSongs: any[] | null = null

async function getToken(): Promise<string> {
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
