import { apiPrefix } from '../../../core/config/app-config.js'
import { getSharedClient } from '../../../core/network/api-client.js'
import { appendMediaVideoParam, buildResourceUrl, defaultUrlContext } from '../../../core/network/url-helper.js'
import { useAppSessionStore } from '../../../store/app-session.js'

interface CreatedSession {
  id: string
  playlist_url: string
}

export interface RadioHlsSession {
  playbackUrl(): string
  close(): Promise<void>
}

const sessionsPath = `${apiPrefix}/proxy/transcode/hls/sessions`

export async function createRadioHlsSession(songId: number, signal: AbortSignal): Promise<RadioHlsSession> {
  const { resolvedBaseUrl, basePath } = defaultUrlContext()
  const { baseUrl, username } = useAppSessionStore.getState()
  const client = getSharedClient()
  const sameBackend = () => {
    const current = defaultUrlContext()
    const session = useAppSessionStore.getState()
    return current.resolvedBaseUrl === resolvedBaseUrl && current.basePath === basePath &&
      session.baseUrl === baseUrl && session.username === username
  }
  const { data } = await client.post<CreatedSession>(`${apiPrefix}/songs/${songId}/hls/sessions`, undefined, {
    receiveTimeoutMs: 35_000,
    signal,
    assertCurrent: () => {
      if (signal.aborted || !sameBackend()) throw new Error('Playback source changed')
    },
  })
  if (!/^[0-9a-f]{48}$/.test(data?.id)) {
    throw new Error('Invalid live HLS session response')
  }
  const playlistPath = `${sessionsPath}/${data.id}/playlist.m3u8`
  if (typeof data.playlist_url !== 'string' || !data.playlist_url.endsWith(playlistPath)) {
    throw new Error('Invalid live HLS playlist path')
  }
  return {
    playbackUrl: () => appendMediaVideoParam(buildResourceUrl(playlistPath)),
    close: async () => {
      if (sameBackend()) await client.delete(`${sessionsPath}/${data.id}`, {
        assertCurrent: () => {
          if (!sameBackend()) throw new Error('Backend session changed')
        },
      })
    },
  }
}
