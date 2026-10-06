import { apiPrefix, appConfig } from '../../../core/config/app-config.js'
import { getCachedAccessToken } from '../../../core/network/token-cache.js'
import { getSharedClient } from '../../../core/network/api-client.js'
import type { HttpClient } from '../../../core/network/http-client.js'
import { openURL, pickAndUploadFile } from '../../../native/native-platform.js'
import { getPlatformCapabilities } from '../../../native/platform-capabilities.js'
import { isWebPlatform } from '../../../native/web-platform.js'
import { pickJsonText, saveJsonText, type FileTransferLabels } from '../../../native/web-files.js'

export interface ImportResult {
  playlists_created: number
  playlists_merged: number
  songs_created: number
  songs_matched: number
  songs_skipped?: number
}

export function canExport(): boolean {
  return getPlatformCapabilities().dataTransfer && getCachedAccessToken() !== null
}

export interface TransferOptions {
  labels: FileTransferLabels
  isActive?: () => boolean
}

export function parseImportResult(value: unknown): ImportResult {
  const result = value as ImportResult | null
  if (!result || ['playlists_created', 'playlists_merged', 'songs_created', 'songs_matched']
    .some(key => !Number.isSafeInteger(result[key as keyof ImportResult]) || (result[key as keyof ImportResult] ?? -1) < 0)) {
    throw new Error('invalid_response')
  }
  return result
}

function validateBackup(text: string): void {
  try {
    const json = JSON.parse(text) as { version?: unknown; playlists?: unknown } | null
    if (!json || typeof json !== 'object' || json.version !== 1 || !Array.isArray(json.playlists)) {
      throw new Error('invalid_json')
    }
  } catch { throw new Error('invalid_json') }
}

/** A string multipart body can be replayed after a 401 in the existing client. */
export function jsonMultipart(text: string): { body: string; contentType: string } {
  validateBackup(text)
  let boundary = `songloft-${Date.now()}-${Math.random().toString(36).slice(2)}`
  while (text.includes(boundary)) boundary += '-x'
  return {
    contentType: `multipart/form-data; boundary=${boundary}`,
    body: `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="songloft-backup.json"\r\nContent-Type: application/json\r\n\r\n${text}\r\n--${boundary}--\r\n`,
  }
}

export class PlaylistBackupApi {
  constructor(private readonly client: HttpClient) {}

  async exportBackup(): Promise<string> {
    const result = await this.client.get<string>(`${apiPrefix}/playlists/export`, {
      parseJson: false, receiveTimeoutMs: 120_000,
    })
    // Do not save an HTML error page returned by a misconfigured reverse proxy.
    validateBackup(result.data)
    return result.data
  }

  async importBackup(text: string): Promise<ImportResult> {
    const multipart = jsonMultipart(text)
    const result = await this.client.post<unknown>(`${apiPrefix}/playlists/import`, multipart.body, {
      headers: { 'Content-Type': multipart.contentType }, receiveTimeoutMs: 120_000,
    })
    return parseImportResult(result.data)
  }
}

function transferContext(options: TransferOptions | undefined): (checkToken?: boolean) => void {
  const base = `${appConfig.resolvedBaseUrl}${appConfig.basePath}`
  const token = getCachedAccessToken()
  return (checkToken = false) => {
    if (options?.isActive?.() === false) throw new Error('cancelled')
    if (base !== `${appConfig.resolvedBaseUrl}${appConfig.basePath}`
      || (checkToken && token !== getCachedAccessToken())) throw new Error('session_changed')
    if (!getCachedAccessToken()) throw new Error('not_logged_in')
  }
}

export async function exportPlaylists(options?: TransferOptions): Promise<void> {
  const token = getCachedAccessToken()
  if (!token) throw new Error('not_logged_in')
  if (isWebPlatform()) {
    if (!options) throw new Error('file_transfer_unavailable')
    const assertActive = transferContext(options)
    assertActive()
    const text = await new PlaylistBackupApi(getSharedClient()).exportBackup()
    assertActive()
    await saveJsonText({ ...options.labels, text, fileName: `songloft-backup-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.json` })
    return
  }
  const url = `${appConfig.resolvedBaseUrl}${apiPrefix}/playlists/export?access_token=${encodeURIComponent(token)}`
  openURL(url)
}

export async function importPlaylists(options?: TransferOptions): Promise<ImportResult> {
  const token = getCachedAccessToken()
  if (!token) throw new Error('not_logged_in')
  if (isWebPlatform()) {
    if (!options) throw new Error('file_transfer_unavailable')
    const assertActive = transferContext(options)
    const text = await pickJsonText(options.labels)
    assertActive(true)
    const result = await new PlaylistBackupApi(getSharedClient()).importBackup(text)
    assertActive()
    return result
  }
  const url = `${appConfig.resolvedBaseUrl}${apiPrefix}/playlists/import?access_token=${encodeURIComponent(token)}`
  const body = await pickAndUploadFile(url, 'file', 'application/json')
  return parseImportResult(JSON.parse(body))
}
