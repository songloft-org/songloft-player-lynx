import { useInfiniteQuery, useQuery } from '@tanstack/react-query'

import { defaultPageSize } from '../../../core/config/constants.js'
import { songsNextPageParam } from '../../library/data/pagination.js'
import {
  getPlaylistApi,
  type PlaylistsFilters,
  type PlaylistSongsFilters,
} from '../api/index.js'
import { playlistsNextPageParam } from './pagination.js'

/**
 * TanStack Query integration for the playlist feature, following the batch-4
 * library pattern: infinite lists page by `offset`/`limit` with the pure
 * `getNextPageParam` helpers, and the single-playlist detail uses a plain
 * `useQuery`. Query keys embed the filters / id so cache identity is stable.
 */

export const playlistQueryKeys = {
  list: (filters: PlaylistsFilters) => ['playlist', 'list', filters] as const,
  detail: (id: number) => ['playlist', 'detail', id] as const,
  songs: (id: number, filters: PlaylistSongsFilters) =>
    ['playlist', 'songs', id, filters] as const,
}

/** Infinite playlist list for the given filters. */
export function usePlaylistsInfiniteQuery(filters: PlaylistsFilters = {}) {
  return useInfiniteQuery({
    queryKey: playlistQueryKeys.list(filters),
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      getPlaylistApi().getPlaylists(filters, {
        limit: defaultPageSize,
        offset: pageParam,
      }),
    getNextPageParam: playlistsNextPageParam,
  })
}

/** Single playlist detail (header metadata). */
export function usePlaylistQuery(id: number) {
  return useQuery({
    queryKey: playlistQueryKeys.detail(id),
    queryFn: () => getPlaylistApi().getPlaylist(id),
    enabled: id > 0,
  })
}

/** Infinite song list inside a playlist (reuses the songs page accounting). */
export function usePlaylistSongsInfiniteQuery(
  id: number,
  filters: PlaylistSongsFilters = {},
) {
  return useInfiniteQuery({
    queryKey: playlistQueryKeys.songs(id, filters),
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      getPlaylistApi().getPlaylistSongs(id, filters, {
        limit: defaultPageSize,
        offset: pageParam,
      }),
    getNextPageParam: songsNextPageParam,
    enabled: id > 0,
  })
}
