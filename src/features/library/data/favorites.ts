import { useCallback } from '@lynx-js/react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { favoritePlaylistId } from '../../../core/config/constants.js'
import { getQueryClient } from '../../../lib/query/index.js'
import { getPlaylistApi } from '../../playlist/api/index.js'

const FAV_QUERY_KEY = ['favorites', 'songIds'] as const
const FAV_STALE_TIME_MS = 60_000

async function fetchFavoriteSongIds(): Promise<Set<number>> {
  const api = getPlaylistApi()
  const pages: number[] = []
  let offset = 0
  const limit = 200
  for (;;) {
    const res = await api.getPlaylistSongs(Number(favoritePlaylistId), {}, { offset, limit })
    for (const s of res.songs) pages.push(s.id)
    if (pages.length >= res.total) break
    offset += limit
  }
  return new Set(pages)
}

function useFavoriteSongIds() {
  return useQuery({
    queryKey: FAV_QUERY_KEY,
    queryFn: fetchFavoriteSongIds,
    staleTime: FAV_STALE_TIME_MS,
  })
}

export function useIsFavorite(songId: number): boolean {
  const { data } = useFavoriteSongIds()
  return data?.has(songId) ?? false
}

export function useFavoriteToggle(songId: number) {
  const queryClient = useQueryClient()
  const isFavorite = useIsFavorite(songId)
  const playlistId = Number(favoritePlaylistId)

  const add = useMutation({
    mutationFn: () => getPlaylistApi().addSongsToPlaylist(playlistId, [songId]),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: FAV_QUERY_KEY }),
  })

  const remove = useMutation({
    mutationFn: () => getPlaylistApi().removeSongFromPlaylist(playlistId, songId),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: FAV_QUERY_KEY }),
  })

  const toggle = useCallback(() => {
    if (isFavorite) remove.mutate()
    else add.mutate()
  }, [isFavorite, add, remove])

  return { isFavorite, toggle, isPending: add.isPending || remove.isPending }
}

/**
 * Non-React favorite toggle for the media-notification favorite button: the
 * handler runs from a native `remoteCommand` global event outside the React
 * tree, so it goes through the shared {@link getQueryClient} singleton instead
 * of a hook. Returns the resulting favorite state so the caller can push it
 * back to the native module (`SongloftAudio.setFavorite`) for the icon.
 */
export async function toggleFavoriteNonReact(songId: number): Promise<boolean> {
  const queryClient = getQueryClient()
  const ids = await queryClient.fetchQuery({
    queryKey: FAV_QUERY_KEY,
    queryFn: fetchFavoriteSongIds,
    staleTime: FAV_STALE_TIME_MS,
  })
  const wasFavorite = ids.has(songId)
  const playlistId = Number(favoritePlaylistId)
  if (wasFavorite) await getPlaylistApi().removeSongFromPlaylist(playlistId, songId)
  else await getPlaylistApi().addSongsToPlaylist(playlistId, [songId])
  await queryClient.invalidateQueries({ queryKey: FAV_QUERY_KEY })
  return !wasFavorite
}

/** Non-React favorite lookup — used to sync the notification icon on track change. */
export async function getFavoriteState(songId: number): Promise<boolean> {
  const queryClient = getQueryClient()
  const ids = await queryClient.fetchQuery({
    queryKey: FAV_QUERY_KEY,
    queryFn: fetchFavoriteSongIds,
    staleTime: FAV_STALE_TIME_MS,
  })
  return ids.has(songId)
}
