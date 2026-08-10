import { createApiClient, type ApiClientBundle } from '../../../core/network/api-client.js'
import { useAuthStore } from '../../auth/store/index.js'
import { JSPluginApi } from './jsplugin-api.js'

export { JSPluginApi } from './jsplugin-api.js'
export type { RegistryRefreshParams, InstallFromRegistryParams } from './jsplugin-api.js'

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

export function getJSPluginApi(): JSPluginApi {
  return new JSPluginApi(getApiBundle().client)
}

export function resetJSPluginApiForTests(): void {
  bundle = null
}
