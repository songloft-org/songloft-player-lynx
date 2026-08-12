import { createApiClient, type ApiClientBundle } from '../../../core/network/api-client.js'
import { useAuthStore } from '../../auth/store/index.js'
import { FingerprintApi } from './fingerprint-api.js'
import { ScanApi } from './scan-api.js'
import { ScanSettingsApi } from './scan-settings-api.js'

export { ScanApi, buildScanBody, buildDirectoriesQuery } from './scan-api.js'
export type { StartScanParams, ScanBody } from './scan-api.js'
export { ScanSettingsApi } from './scan-settings-api.js'
export { FingerprintApi } from './fingerprint-api.js'

/**
 * Lazily-built authenticated client bundle for this feature (same recipe as
 * `features/playlist/api/index.ts` — each feature owns its own singleton so
 * importing a barrel never constructs a transport). All library-ops peers share
 * the process-wide `TokenStore`, so 401 recovery stays consistent across features.
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

export function getScanApi(): ScanApi {
  return new ScanApi(getApiBundle().client)
}

export function getScanSettingsApi(): ScanSettingsApi {
  return new ScanSettingsApi(getApiBundle().client)
}

export function getFingerprintApi(): FingerprintApi {
  return new FingerprintApi(getApiBundle().client)
}

export function resetLibraryOpsApiForTests(): void {
  bundle = null
}
