import { useCallback } from '@lynx-js/react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { favoritePlaylistId } from '../../../core/config/constants.js'
import { getQueryClient } from '../../../lib/query/index.js'
import { getPlaylistApi } from '../../playlist/api/index.js'

const FAV_QUERY_KEY = ['favorites', 'songIds'] as const
const FAV_STALE_TIME_MS = 60_000

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
  const playlistId = Number(favoritePlaylistId)

  // Flip the cached set immediately so the heart/collection icon reacts on the
  // same frame as the tap. Without this, every favorite control waits a full
  // server round-trip (plus the 60s-stale query refetch) before changing color,
  // which reads as "the button did nothing". Snapshot first so a failed write
  // restores exactly what the user saw before.
  const snapshot = useCallback(() => queryClient.getQueryData<Set<number>>(FAV_QUERY_KEY), [queryClient])

  const add = useMutation({
    mutationFn: () => getPlaylistApi().addSongsToPlaylist(playlistId, [songId]),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: FAV_QUERY_KEY })
      const previous = snapshot()
      if (previous) {
        queryClient.setQueryData<Set<number>>(FAV_QUERY_KEY, ids => {
          const next = new Set(ids)
          next.add(songId)
          return next
        })
      }
      return { previous }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(FAV_QUERY_KEY, ctx.previous)
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: FAV_QUERY_KEY }),
  })

  const remove = useMutation({
    mutationFn: () => getPlaylistApi().removeSongFromPlaylist(playlistId, songId),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: FAV_QUERY_KEY })
      const previous = snapshot()
      if (previous) {
        queryClient.setQueryData<Set<number>>(FAV_QUERY_KEY, ids => {
          const next = new Set(ids)
          next.delete(songId)
          return next
        })
      }
      return { previous }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(FAV_QUERY_KEY, ctx.previous)
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: FAV_QUERY_KEY }),
  })

  const toggle = useCallback(() => {
    if (!enabled) return
    if (isFavorite) remove.mutate()
    else add.mutate()
  }, [enabled, isFavorite, add, remove])

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
