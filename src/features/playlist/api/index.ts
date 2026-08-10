import { createApiClient, type ApiClientBundle } from '../../../core/network/api-client.js'
import { useAuthStore } from '../../auth/store/index.js'
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

export function getPlaylistApi(): PlaylistApi {
  return new PlaylistApi(getApiBundle().client)
}

export function resetPlaylistApiForTests(): void {
  bundle = null
}
