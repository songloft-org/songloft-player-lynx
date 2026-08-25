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

/**
 * Hide / show, by id per call — see the note on {@link useSetPinnedMutation}
 * for why these two take the id as an argument rather than closing over it.
 */
export function useSetVisibilityMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, hidden }: { id: number; hidden: boolean }) =>
      getPlaylistApi().setPlaylistVisibility(id, hidden),
    onSuccess: (_result, { id }) => {
      void queryClient.invalidateQueries({ queryKey: playlistQueryKeys.detail(id) })
      void queryClient.invalidateQueries({ queryKey: ['playlist', 'list'] })
    },
  })
}

/**
 * Pin / unpin, by id per call.
 *
 * The id is an argument rather than closed over the way the song mutations
 * above are: the playlist *list* serves every row from one hook instance, and
 * the detail page can just as well pass its own id. `mutationFn` takes a single
 * value, hence the object.
 *
 * No optimistic reordering — the pinned-first order is computed by the backend
 * (`ORDER BY pinned_at IS NULL, pinned_at DESC, position`), so only a re-read
 * shows it. The list key is the literal prefix so every filter variant of the
 * list is refetched, not just the one this row happened to come from.
 */
export function useSetPinnedMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, pinned }: { id: number; pinned: boolean }) =>
      getPlaylistApi().setPlaylistPinned(id, pinned),
    onSuccess: (_result, { id }) => {
      void queryClient.invalidateQueries({ queryKey: playlistQueryKeys.detail(id) })
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
