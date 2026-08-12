import { apiPrefix, appConfig } from '../../../core/config/app-config.js'
import { getCachedAccessToken } from '../../../core/network/token-cache.js'
import { isNativePlatformAvailable, openURL, pickAndUploadFile } from '../../../native/native-platform.js'

export interface ImportResult {
  playlists_created: number
  playlists_merged: number
  songs_created: number
  songs_matched: number
}

export function canExport(): boolean {
  return isNativePlatformAvailable() && getCachedAccessToken() !== null
}

export function exportPlaylists(): void {
  const token = getCachedAccessToken()
  if (!token) return
  const url = `${appConfig.resolvedBaseUrl}${apiPrefix}/playlists/export?access_token=${encodeURIComponent(token)}`
  openURL(url)
}

export async function importPlaylists(): Promise<ImportResult> {
  const token = getCachedAccessToken()
  if (!token) throw new Error('not_logged_in')
  const url = `${appConfig.resolvedBaseUrl}${apiPrefix}/playlists/import?access_token=${encodeURIComponent(token)}`
  const body = await pickAndUploadFile(url, 'file', 'application/json')
  return JSON.parse(body) as ImportResult
}
