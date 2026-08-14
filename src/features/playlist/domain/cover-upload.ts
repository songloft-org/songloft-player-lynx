import { apiPrefix, appConfig } from '../../../core/config/app-config.js'
import { getCachedAccessToken } from '../../../core/network/token-cache.js'
import { isNativePlatformAvailable, pickAndUploadFile } from '../../../native/native-platform.js'

export function canUploadCover(): boolean {
  return isNativePlatformAvailable() && getCachedAccessToken() !== null
}

export async function uploadPlaylistCover(playlistId: number): Promise<void> {
  const token = getCachedAccessToken()
  if (!token) throw new Error('not_logged_in')
  const url = `${appConfig.resolvedBaseUrl}${apiPrefix}/playlists/${playlistId}/cover?access_token=${encodeURIComponent(token)}`
  await pickAndUploadFile(url, 'file', 'image/*')
}
