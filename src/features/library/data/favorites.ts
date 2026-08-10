import { useCallback } from '@lynx-js/react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { favoritePlaylistId } from '../../../core/config/constants.js'
import { getPlaylistApi } from '../../playlist/api/index.js'

const FAV_QUERY_KEY = ['favorites', 'songIds'] as const

function useFavoriteSongIds() {
  return useQuery({
    queryKey: FAV_QUERY_KEY,
    queryFn: async () => {
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
    },
    staleTime: 60_000,
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
