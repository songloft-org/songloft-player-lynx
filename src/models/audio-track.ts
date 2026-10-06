/** Audio-relative index: ffmpeg -map 0:a:N, never the array position. */
export interface AudioTrackInfo {
  index: number
  codec: string
  language: string | null
  title: string | null
  default: boolean
}

export function parseAudioTracks(body: unknown): AudioTrackInfo[] {
  if (!body || typeof body !== 'object') throw new Error('Invalid audio tracks response')
  const tracks = (body as { tracks?: unknown }).tracks
  if (!Array.isArray(tracks)) throw new Error('Invalid audio tracks response')
  const seen = new Set<number>()
  return tracks.flatMap((item: unknown) => {
    if (!item || typeof item !== 'object') return []
    const raw = item as Record<string, unknown>
    if (typeof raw.index !== 'number' || !Number.isSafeInteger(raw.index) || raw.index < 0 || seen.has(raw.index)) return []
    seen.add(raw.index)
    return [{
      index: raw.index,
      codec: typeof raw.codec === 'string' ? raw.codec : '',
      language: typeof raw.language === 'string' && raw.language.trim() ? raw.language : null,
      title: typeof raw.title === 'string' && raw.title.trim() ? raw.title : null,
      default: raw.default === true,
    }]
  })
}
