import { createApiClient, type ApiClientBundle } from '../../../core/network/api-client.js'
import { useAuthStore } from '../../auth/store/index.js'
import { SongsApi } from './songs-api.js'

export {
  SongsApi,
  buildSongsQuery,
  buildSongIdsQuery,
  buildFacetsQuery,
} from './songs-api.js'
export type {
  SongsFilters,
  PageParams,
  FacetParams,
  SongIdsResponse,
  LyricPayload,
} from './songs-api.js'

/**
 * Process-wide authenticated API client bundle (batch-2 `createApiClient`:
 * `AuthInterceptor` Bearer injection + single-flight 401 refresh over a
 * dedicated refresh client, backed by the ambient `SongloftStorage` secure
 * namespace). Created lazily so merely importing the library feature never
 * constructs a transport.
 *
 * When a refresh ultimately fails the interceptor calls `onTokenExpired`; we
 * route that to the auth store's `logout()`, so the route guard immediately
 * redirects to `/login` (mirrors the Flutter interceptor → auth-provider flow).
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

/** The shared authenticated `SongsApi` (constructed over the singleton client). */
export function getSongsApi(): SongsApi {
  return new SongsApi(getApiBundle().client)
}

/** Test hook: drop the memoized client so a fresh one is built next call. */
export function resetLibraryApiForTests(): void {
  bundle = null
}
