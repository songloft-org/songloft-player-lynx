import { getSharedApiBundle } from '../../../core/network/api-client.js'
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
 * Process-wide authenticated API client bundle (P2-1 singleton consolidation).
 * Every feature shares one `TokenStore` + `AuthInterceptor` via
 * `getSharedApiBundle()`; each feature only wraps its own `XxxApi` class around
 * the shared `HttpClient`.
 */

export function getSongsApi(): SongsApi {
  return new SongsApi(getSharedApiBundle().client)
}