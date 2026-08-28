import { getSharedApiBundle } from '../../../core/network/api-client.js'
import { LibraryBrowseApi } from './library-browse-api.js'
import { SongsApi } from './songs-api.js'
import { SongTagsApi } from './song-tags-api.js'

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
export { LibraryBrowseApi } from './library-browse-api.js'
export { SongTagsApi } from './song-tags-api.js'
export type { TagListParams } from './song-tags-api.js'

/**
 * Process-wide authenticated API client bundle (P2-1 singleton consolidation).
 * Every feature shares one `TokenStore` + `AuthInterceptor` via
 * `getSharedApiBundle()`; each feature only wraps its own `XxxApi` class around
 * the shared `HttpClient`.
 */

export function getSongsApi(): SongsApi {
  return new SongsApi(getSharedApiBundle().client)
}

export function getLibraryBrowseApi(): LibraryBrowseApi {
  return new LibraryBrowseApi(getSharedApiBundle().client)
}

export function getSongTagsApi(): SongTagsApi {
  return new SongTagsApi(getSharedApiBundle().client)
}