import { createApiClient, type ApiClientBundle } from '../../../core/network/api-client.js'
import { useAuthStore } from '../../auth/store/index.js'
import { PlaylistApi } from './playlist-api.js'

export {
  PlaylistApi,
  buildPlaylistsQuery,
  buildPlaylistSongsQuery,
} from './playlist-api.js'
export type {
  PlaylistsFilters,
  PlaylistSongsFilters,
  PageParams,
} from './playlist-api.js'

/**
 * Process-wide authenticated API client bundle for the playlist feature. Built
 * with the same batch-2 `createApiClient` recipe the library feature uses
 * (`AuthInterceptor` Bearer injection + single-flight 401 refresh over a
 * dedicated refresh client, backed by the ambient `SongloftStorage` secure
 * namespace); a failed refresh routes `onTokenExpired` → auth store `logout()`
 * so the route guard redirects to `/login`.
 *
 * Created lazily so merely importing the playlist feature never constructs a
 * transport. It is a peer of the library bundle (both read the same shared
 * `TokenStore`, so 401 recovery stays coherent across features).
 */
let bundle: ApiClientBundle | null = null

function getApiBundle(): ApiClientBundle {
  if (!bundle) {
    bundle = createApiClient({
      onTokenExpired: () => {
        void useAuthStore.getState().logout()
      },
    })
  }
  return bundle
}

/** The shared authenticated `PlaylistApi` (constructed over the singleton client). */
export function getPlaylistApi(): PlaylistApi {
  return new PlaylistApi(getApiBundle().client)
}

/** Test hook: drop the memoized client so a fresh one is built next call. */
export function resetPlaylistApiForTests(): void {
  bundle = null
}
