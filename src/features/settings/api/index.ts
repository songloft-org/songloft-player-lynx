import { getSharedApiBundle } from '../../../core/network/api-client.js'
import { CacheApi } from './cache-api.js'
import { SettingsApi } from './settings-api.js'
import { ThemePacksApi } from './theme-packs-api.js'

export { CacheApi } from './cache-api.js'
export { SettingsApi } from './settings-api.js'
export { ThemePacksApi } from './theme-packs-api.js'

export function getSettingsApi(): SettingsApi {
  return new SettingsApi(getSharedApiBundle().client)
}

export function getCacheApi(): CacheApi {
  return new CacheApi(getSharedApiBundle().client)
}

export function getThemePacksApi(): ThemePacksApi {
  return new ThemePacksApi(getSharedApiBundle().client)
}