import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { defaultPageSize } from '../../../core/config/constants.js'
import { getSongTagsApi, getSongsApi } from '../api/index.js'
import { getSettingsApi } from '../../settings/api/index.js'
import type { SongTag, SongTagListResponse } from '../../../models/song-tag.js'
import type { SongListResponse } from '../../../models/song.js'
import {
  useRemoteSetting,
  useRemoteSettingMutation,
} from '../../library-ops/data/remote-setting.js'
import { songsNextPageParam } from './pagination.js'

export const songTagQueryKeys = {
  all: ['song-tags'] as const,
  list: (keyword?: string) => ['song-tags', 'list', keyword ?? ''] as const,
  songs: (tagId: number) => ['song-tags', tagId, 'songs'] as const,
  songIds: (tagId: number) => ['song-tags', tagId, 'ids'] as const,
  forSong: (songId: number) => ['song-tags', 'for-song', songId] as const,
}

function tagListNextPageParam(
  lastPage: SongTagListResponse,
  allPages: readonly SongTagListResponse[],
): number | undefined {
  const loaded = allPages.reduce((sum, p) => sum + p.tags.length, 0)
  return loaded < lastPage.total ? loaded : undefined
}

export function flattenTags(pages: readonly SongTagListResponse[] | undefined): SongTag[] {
  if (!pages) return []
  return pages.flatMap((p) => p.tags)
}

export function useTagListInfiniteQuery(keyword?: string) {
  return useInfiniteQuery({
    queryKey: songTagQueryKeys.list(keyword),
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      getSongTagsApi().list({
        keyword: keyword || undefined,
        sort: 'song_count',
        order: 'desc',
        limit: defaultPageSize,
        offset: pageParam,
      }),
    getNextPageParam: tagListNextPageParam,
  })
}

export function useTagSongsInfiniteQuery(tagId: number) {
  return useInfiniteQuery({
    queryKey: songTagQueryKeys.songs(tagId),
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      return getSongsApi().getSongs(
        { tagId },
        { limit: defaultPageSize, offset: pageParam },
      )
    },
    getNextPageParam: songsNextPageParam,
    enabled: tagId > 0,
  })
}

export function useTagSongIdsQuery(tagId: number, enabled = true) {
  return useQuery({
    queryKey: songTagQueryKeys.songIds(tagId),
    queryFn: () => getSongTagsApi().getSongIds(tagId),
    enabled: enabled && tagId > 0,
  })
}

export function useSongTagsQuery(songId: number, enabled = true) {
  return useQuery({
    queryKey: songTagQueryKeys.forSong(songId),
    queryFn: () => getSongTagsApi().getSongTags(songId),
    enabled: enabled && songId > 0,
  })
}

export function useCreateTagMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ name, color }: { name: string; color?: string }) =>
      getSongTagsApi().create(name, color),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: songTagQueryKeys.all })
    },
  })
}

export function useUpdateTagMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, name, color }: { id: number; name?: string; color?: string }) =>
      getSongTagsApi().update(id, { name, color }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: songTagQueryKeys.all })
    },
  })
}

export function useDeleteTagMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => getSongTagsApi().delete(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: songTagQueryKeys.all })
    },
  })
}

export function useSetSongTagsMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ songId, tagIds }: { songId: number; tagIds: number[] }) =>
      getSongTagsApi().setSongTags(songId, tagIds),
    onSuccess: (_result, { songId }) => {
      void queryClient.invalidateQueries({ queryKey: songTagQueryKeys.forSong(songId) })
      void queryClient.invalidateQueries({ queryKey: songTagQueryKeys.all })
    },
  })
}

export function useBindSongsMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ tagId, songIds }: { tagId: number; songIds: number[] }) =>
      getSongTagsApi().bind(tagId, songIds),
    onSuccess: (_result, { tagId }) => {
      void queryClient.invalidateQueries({ queryKey: songTagQueryKeys.songs(tagId) })
      void queryClient.invalidateQueries({ queryKey: songTagQueryKeys.all })
    },
  })
}

export function useFromPlaylistMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (playlistId: number) => getSongTagsApi().fromPlaylist(playlistId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: songTagQueryKeys.all })
    },
  })
}

const tagSyncKey = ['song-tags', 'sync-to-file'] as const

export function useTagSyncToFile() {
  return useRemoteSetting<boolean>(
    tagSyncKey,
    () => getSettingsApi().getTagSyncToFile(),
    false,
  )
}

export function useSetTagSyncToFile() {
  return useRemoteSettingMutation<boolean>(
    tagSyncKey,
    (next) => getSettingsApi().updateTagSyncToFile(next),
  )
}
