import { apiPrefix, appConfig } from '../../../core/config/app-config.js'
import { getSharedClient } from '../../../core/network/api-client.js'
import { ApiError } from '../../../core/network/http-client.js'
import { getQueryClient } from '../../../lib/query/index.js'
import { subscribeAppVisibility } from '../../../native/app-visibility.js'
import { getAudio } from '../../../native/audio-facade.js'
import { useAppSessionStore } from '../../../store/app-session.js'
import { useAuthStore } from '../../auth/store/index.js'
import { usePlayerStore } from '../../player/store/index.js'
import { FavoriteChangeWatcher, type FavoriteChange } from '../domain/favorite-change-watcher.js'

export function parseFavoriteChange(raw: unknown): FavoriteChange {
  const event = raw as FavoriteChange | null
  if (!event || typeof event.cursor !== 'string' || !event.cursor || typeof event.changed !== 'boolean') {
    throw new Error('Invalid favorite change notification')
  }
  return { cursor: event.cursor, changed: event.changed }
}

/** Reconcile the complete ID set and invalidate both built-in playlist views. */
export async function refreshFavoritesFromServer(options: { serverBaseUrl: string; assertCurrent: () => void }): Promise<void> {
  const { serverBaseUrl, assertCurrent } = options
  const queries = getQueryClient()
  const key = ['favorites', 'songIds'] as const
  assertCurrent()
  // Cancel older favorite reads before writing an authoritative snapshot.
  await queries.cancelQueries({ queryKey: key })
  assertCurrent()
  const response = await getSharedClient().get<{ ids: number[] }>(`${serverBaseUrl}${apiPrefix}/playlists/1/song-ids`, { assertCurrent })
  assertCurrent()
  if (!Array.isArray(response.data.ids) || response.data.ids.some(id => !Number.isSafeInteger(id) || id <= 0)) {
    throw new Error('Invalid favorite song IDs')
  }
  await queries.cancelQueries({ queryKey: key })
  assertCurrent()
  const ids = new Set(response.data.ids)
  queries.setQueryData(key, ids)
  const invalidations = [queries.invalidateQueries({ queryKey: ['playlist', 'list'] })]
  for (const id of [1, 2]) {
    for (const kind of ['songs', 'song-ids', 'detail']) {
      invalidations.push(queries.invalidateQueries({ queryKey: ['playlist', kind, id] }))
    }
  }
  await Promise.all(invalidations)
  assertCurrent()
  const song = usePlayerStore.getState().currentSong
  if (song) await getAudio().setFavorite(ids.has(song.id))
}

let dispose: (() => void) | undefined

/** App-wide subscription, including fullscreen player routes. */
export function initializeFavoriteChanges(): () => void {
  dispose?.()
  let watcher: FavoriteChangeWatcher | undefined
  let scope: string | null = null
  let visible = true
  const currentScope = () => {
    const auth = useAuthStore.getState()
    const session = useAppSessionStore.getState()
    return visible && auth.status === 'authenticated' && !auth.isLoading && session.username
      ? JSON.stringify([session.baseUrl, appConfig.basePath, session.username])
      : null
  }
  const refreshSession = () => {
    const next = currentScope()
    if (next === scope) return
    watcher?.stop()
    watcher = undefined
    scope = next
    if (!next) return
    const serverBaseUrl = () => `${appConfig.resolvedBaseUrl}${appConfig.basePath}`.replace(/\/$/, '')
    const assertScope = () => { if (currentScope() !== next) throw new Error('Favorite session changed') }
    watcher = new FavoriteChangeWatcher({
      assertCurrent: assertScope,
      poll: async (cursor, assertCurrent) => {
        const response = await getSharedClient().get(`${serverBaseUrl()}${apiPrefix}/playlists/favorites/changes`, {
          query: { cursor }, receiveTimeoutMs: 35_000, assertCurrent,
        })
        return parseFavoriteChange(response.data)
      },
      refresh: assertCurrent => refreshFavoritesFromServer({ serverBaseUrl: serverBaseUrl(), assertCurrent }),
      unsupported: error => error instanceof ApiError && error.status === 404,
    })
    void watcher.run()
  }
  const stops = [
    useAuthStore.subscribe(refreshSession),
    useAppSessionStore.subscribe(refreshSession),
    subscribeAppVisibility(value => { visible = value; refreshSession() }),
  ]
  refreshSession()
  const stop = () => { watcher?.stop(); stops.forEach(fn => fn()) }
  dispose = stop
  return stop
}
