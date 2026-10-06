import { useQuery } from '@tanstack/react-query'

import { appConfig } from '../../../core/config/app-config.js'
import type { Song } from '../../../models/song.js'
import { useAppSessionStore } from '../../../store/app-session.js'
import { useServerStore } from '../../settings/store/server-store.js'
import { getSongsApi } from '../../library/api/index.js'
import { cachedSongIdentity } from '../domain/offline-cache.js'

export function audioTracksQueryKey({ profile, server, username, song }: {
  profile: string | null
  server: string
  username: string | null
  song: Song | null
}) {
  return ['audio-tracks', profile, server, username, song?.id, song?.updatedAt] as const
}

export function useAudioTracks(song: Song | null) {
  const baseUrl = useAppSessionStore((s) => s.baseUrl)
  const username = useAppSessionStore((s) => s.username)
  const profile = useServerStore((s) => s.activeProfileId)
  return useQuery({
    queryKey: audioTracksQueryKey({ profile, server: `${baseUrl}${appConfig.basePath}`, username, song }),
    queryFn: () => getSongsApi().getTracks(song!.id),
    enabled: song != null && !cachedSongIdentity(song) && !song.isLive && song.type !== 'radio',
    staleTime: 60_000,
    retry: false,
  })
}
