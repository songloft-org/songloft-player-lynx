import { useMutation, useQueryClient } from '@tanstack/react-query'

import {
  getPlaylistApi,
  type CreatePlaylistParams,
  type UpdatePlaylistParams,
} from '../api/index.js'
import { playlistQueryKeys } from './playlist-query.js'

export function useCreatePlaylistMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (params: CreatePlaylistParams) =>
      getPlaylistApi().createPlaylist(params),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['playlist', 'list'] })
    },
  })
}

export function useUpdatePlaylistMutation(id: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (params: UpdatePlaylistParams) =>
      getPlaylistApi().updatePlaylist(id, params),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: playlistQueryKeys.detail(id) })
      void queryClient.invalidateQueries({ queryKey: ['playlist', 'list'] })
    },
  })
}

export function useDeletePlaylistMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => getPlaylistApi().deletePlaylist(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['playlist', 'list'] })
    },
  })
}

export function useAddSongsMutation(playlistId: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (songIds: number[]) =>
      getPlaylistApi().addSongsToPlaylist(playlistId, songIds),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['playlist', 'songs', playlistId],
      })
      void queryClient.invalidateQueries({
        queryKey: playlistQueryKeys.detail(playlistId),
      })
    },
  })
}

export function useRemoveSongMutation(playlistId: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (songId: number) =>
      getPlaylistApi().removeSongFromPlaylist(playlistId, songId),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['playlist', 'songs', playlistId],
      })
      void queryClient.invalidateQueries({
        queryKey: playlistQueryKeys.detail(playlistId),
      })
    },
  })
}

export function useReorderPlaylistsMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (playlistIds: number[]) =>
      getPlaylistApi().reorderPlaylists(playlistIds),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['playlist', 'list'] })
    },
  })
}

export function useReorderSongsMutation(playlistId: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (songIds: number[]) =>
      getPlaylistApi().reorderPlaylistSongs(playlistId, songIds),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['playlist', 'songs', playlistId],
      })
      void queryClient.invalidateQueries({
        queryKey: playlistQueryKeys.detail(playlistId),
      })
    },
  })
}

/** Move a single song to a new position — no full-list reorder needed. */
export function useMoveSongMutation(playlistId: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      songId,
      afterSongId,
    }: {
      songId: number
      afterSongId: number | null
    }) => getPlaylistApi().movePlaylistSong(playlistId, songId, afterSongId),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['playlist', 'songs', playlistId],
      })
      void queryClient.invalidateQueries({
        queryKey: playlistQueryKeys.detail(playlistId),
      })
    },
  })
}

export function useSetVisibilityMutation(playlistId: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (hidden: boolean) =>
      getPlaylistApi().setPlaylistVisibility(playlistId, hidden),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: playlistQueryKeys.detail(playlistId),
      })
      void queryClient.invalidateQueries({ queryKey: ['playlist', 'list'] })
    },
  })
}

export function useUpdateSortMutation(playlistId: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ sortBy, sortOrder }: { sortBy: string; sortOrder: string }) =>
      getPlaylistApi().updatePlaylistSort(playlistId, sortBy, sortOrder),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['playlist', 'songs', playlistId],
      })
      void queryClient.invalidateQueries({
        queryKey: playlistQueryKeys.detail(playlistId),
      })
    },
  })
}
