import { getSharedApiBundle } from '../../../core/network/api-client.js'
import { PlaylistApi } from './playlist-api.js'

export {
  PlaylistApi,
  buildPlaylistsQuery,
  buildPlaylistSongsQuery,
  buildCreatePlaylistBody,
  buildUpdatePlaylistBody,
  buildAddSongsBody,
  buildReorderPlaylistsBody,
  buildReorderSongsBody,
} from './playlist-api.js'
export type {
  PlaylistsFilters,
  PlaylistSongsFilters,
  PageParams,
  CreatePlaylistParams,
  UpdatePlaylistParams,
} from './playlist-api.js'

export function getPlaylistApi(): PlaylistApi {
  return new PlaylistApi(getSharedApiBundle().client)
}