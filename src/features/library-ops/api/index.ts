import { getSharedApiBundle } from '../../../core/network/api-client.js'
import { FingerprintApi } from './fingerprint-api.js'
import { ScanApi } from './scan-api.js'
import { ScanSettingsApi } from './scan-settings-api.js'

export { ScanApi, buildScanBody, buildDirectoriesQuery } from './scan-api.js'
export type { StartScanParams, ScanBody } from './scan-api.js'
export { ScanSettingsApi } from './scan-settings-api.js'
export { FingerprintApi } from './fingerprint-api.js'

export function getScanApi(): ScanApi {
  return new ScanApi(getSharedApiBundle().client)
}

export function getScanSettingsApi(): ScanSettingsApi {
  return new ScanSettingsApi(getSharedApiBundle().client)
}

export function getFingerprintApi(): FingerprintApi {
  return new FingerprintApi(getSharedApiBundle().client)
}