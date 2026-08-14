import { getSharedApiBundle } from '../../../core/network/api-client.js'
import { JSPluginApi } from './jsplugin-api.js'

export { JSPluginApi } from './jsplugin-api.js'
export type { RegistryRefreshParams, InstallFromRegistryParams } from './jsplugin-api.js'

export function getJSPluginApi(): JSPluginApi {
  return new JSPluginApi(getSharedApiBundle().client)
}