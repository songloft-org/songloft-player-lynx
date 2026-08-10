import { createApiClient, type ApiClientBundle } from '../../../core/network/api-client.js'
import { useAuthStore } from '../../auth/store/index.js'
import { SettingsApi } from './settings-api.js'

export { SettingsApi } from './settings-api.js'

/**
 * Process-wide authenticated API client bundle for the settings feature
 * (mirrors `library/api/index.ts`'s `getApiBundle` — each feature builds its
 * own lazily-constructed singleton so merely importing it never constructs a
 * transport).
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

/** The shared authenticated `SettingsApi` (constructed over the singleton client). */
export function getSettingsApi(): SettingsApi {
  return new SettingsApi(getApiBundle().client)
}

/** Test hook: drop the memoized client so a fresh one is built next call. */
export function resetSettingsApiForTests(): void {
  bundle = null
}
