import { useCallback } from '@lynx-js/react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { appConfig } from '../../../core/config/app-config.js'
import { useAppSessionStore } from '../../../store/app-session.js'
import { favoritePlaylistId } from '../../../core/config/constants.js'
import { getQueryClient } from '../../../lib/query/index.js'
import { getPlaylistApi } from '../../playlist/api/index.js'

const FAV_QUERY_KEY = ['favorites', 'songIds'] as const
const FAV_STALE_TIME_MS = 60_000

interface FavoriteWrite {
  songId: number
  favorite: boolean
  isCurrent: () => boolean
}

/** Hard cap on pages, so a bad `total` can never spin forever. 200 × 200 songs. */
const FAV_MAX_PAGES = 200

/**
 * Every favorited song id, paged out of the built-in Favorites playlist.
 *
 * The loop needs two exits, not one. Counting against `res.total` alone
 * deadlocks whenever the server reports more rows than it hands back — a join
 * row surviving its deleted song, a filtered page, an offset past the end — and
 * this runs on **every track change** (`getFavoriteState`), so the failure mode
 * is an endless request storm rather than a single stuck call. Stopping on an
 * empty page is the real termination guarantee; `FAV_MAX_PAGES` is the backstop.
 */
async function fetchFavoriteSongIds(): Promise<Set<number>> {
  const api = getPlaylistApi()
  const ids: number[] = []
  const limit = 200
  for (let page = 0; page < FAV_MAX_PAGES; page += 1) {
    const res = await api.getPlaylistSongs(
      Number(favoritePlaylistId),
      {},
      { offset: page * limit, limit },
    )
    // No progress ⇒ nothing left to read, whatever `total` claims.
    if (res.songs.length === 0) break
    for (const s of res.songs) ids.push(s.id)
    if (ids.length >= res.total) break
  }
  return new Set(ids)
}

function useFavoriteSongIds(enabled = true) {
  return useQuery({
    queryKey: FAV_QUERY_KEY,
    queryFn: fetchFavoriteSongIds,
    staleTime: FAV_STALE_TIME_MS,
    enabled,
  })
}

export function useIsFavorite(songId: number, enabled = true): boolean {
  const { data } = useFavoriteSongIds(enabled)
  return data?.has(songId) ?? false
}

export function useFavoriteToggle(songId: number, enabled = true) {
  const queryClient = useQueryClient()
  const isFavorite = useIsFavorite(songId, enabled)
  const cache = queryClient.getQueryCache()
  const findFavorites = () => cache.find<Set<number>>({ queryKey: FAV_QUERY_KEY, exact: true })

  const mutation = useMutation({
    mutationKey: FAV_QUERY_KEY,
    mutationFn: async (change: FavoriteWrite) => {
      const assertCurrent = () => {
        if (!change.isCurrent()) throw new Error('Favorite session changed')
      }
      assertCurrent()
      const api = getPlaylistApi()
      const playlistId = Number(favoritePlaylistId)
      if (change.favorite) await api.addSongsToPlaylist(playlistId, [change.songId], { assertCurrent })
      else await api.removeSongFromPlaylist(playlistId, change.songId, { assertCurrent })
    },
    onMutate: async (change) => {
      const query = findFavorites()
      await queryClient.cancelQueries({ queryKey: FAV_QUERY_KEY })
      if (!change.isCurrent() || !query || query !== findFavorites()) return
      const previous = query.state.data
      if (!previous) return
      const optimistic = new Set(previous)
      if (change.favorite) optimistic.add(change.songId)
      else optimistic.delete(change.songId)
      queryClient.setQueryData(FAV_QUERY_KEY, optimistic)
      return { query, previous, optimistic }
    },
    onError: (_error, change, context) => {
      if (!change.isCurrent() || !context || context.query !== findFavorites()) return
      if (context.query.state.data === context.optimistic) {
        queryClient.setQueryData(FAV_QUERY_KEY, context.previous)
      } else {
        // A concurrent write or an authoritative refresh replaced our snapshot.
        void queryClient.invalidateQueries({ queryKey: FAV_QUERY_KEY })
      }
    },
    onSuccess: (_result, change) => {
      if (change.isCurrent()) void queryClient.invalidateQueries({ queryKey: FAV_QUERY_KEY })
    },
  })

  const toggle = useCallback(() => {
    if (!enabled || mutation.isPending) return
    const matchingWrites = queryClient.isMutating({
      mutationKey: FAV_QUERY_KEY,
      predicate: (pending) => {
        const change = pending.state.variables as FavoriteWrite | undefined
        return change?.songId === songId && change.isCurrent()
      },
    })
    if (matchingWrites) return
    const session = useAppSessionStore.getState()
    const address = appConfig.resolvedBaseUrl
    const basePath = appConfig.basePath
    const isCurrent = () => useAppSessionStore.getState() === session &&
      appConfig.resolvedBaseUrl === address && appConfig.basePath === basePath
    mutation.mutate({ songId, favorite: !isFavorite, isCurrent })
  }, [enabled, isFavorite, mutation, queryClient, songId])

  return { isFavorite, toggle, isPending: mutation.isPending }
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

/** Synchronize plugin writes without writing to the server a second time. */
export async function refreshFavoritesFromPlugin(songId?: number, isFavorited?: boolean): Promise<void> {
  const client = getQueryClient()
  // Do not let an older GET overwrite an incremental notification.
  await client.cancelQueries({ queryKey: FAV_QUERY_KEY })
  if (songId != null && isFavorited != null && client.getQueryData(FAV_QUERY_KEY) != null) {
    client.setQueryData<Set<number>>(FAV_QUERY_KEY, current => {
      const ids = new Set(current)
      if (isFavorited) ids.add(songId)
      else ids.delete(songId)
      return ids
    })
  } else {
    await client.invalidateQueries({ queryKey: FAV_QUERY_KEY, refetchType: 'none' })
    await client.fetchQuery({ queryKey: FAV_QUERY_KEY, queryFn: fetchFavoriteSongIds, staleTime: 0 })
  }
}
