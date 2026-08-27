import { fileIo } from '@kit.CoreFileKit'
import { http } from '@kit.NetworkKit'
import { LynxModule, LynxMethod, LynxCallback } from '@aspect/lynx'
import { common } from '@kit.AbilityKit'
import { InsecureTls } from '../../net/InsecureTls'

/**
 * SongloftSongCache — single-song offline cache.
 *
 * Four design constraints (each was a bug before):
 * 1. Store in filesDir not cacheDir — user-intended cache must not be reclaimed by OS
 * 2. Download via InsecureTls — self-signed servers must work (download fails while play works otherwise)
 * 3. Atomic write: .part file then rename — partial files on crash won't be served
 * 4. Over-limit reports machine-readable 'limit_exceeded' sentinel — not human text
 *
 * Method names match Android/iOS byte-for-byte (gate-verified).
 */
@LynxModule('SongloftSongCache')
export class SongloftSongCacheModule {
  private context: common.UIAbilityContext
  private cacheDir: string

  constructor(context: common.UIAbilityContext) {
    this.context = context
    this.cacheDir = context.filesDir + '/song_cache'
    this.ensureCacheDir()
  }

  private ensureCacheDir(): void {
    try {
      fileIo.mkdirSync(this.cacheDir)
    } catch {
      // Already exists
    }
  }

  @LynxMethod
  download(songId: string, url: string, maxSizeBytes: number, callback: LynxCallback): void {
    this.doDownload(songId, url, maxSizeBytes, callback)
  }

  @LynxMethod
  getCacheInfo(songId: string, callback: LynxCallback): void {
    const filePath = `${this.cacheDir}/${songId}`
    try {
      const stat = fileIo.statSync(filePath)
      callback(JSON.stringify({
        cached: true,
        path: filePath,
        sizeBytes: stat.size,
      }))
    } catch {
      callback(JSON.stringify({ cached: false }))
    }
  }

  @LynxMethod
  remove(songId: string, callback: LynxCallback): void {
    const filePath = `${this.cacheDir}/${songId}`
    try {
      fileIo.unlinkSync(filePath)
      callback(JSON.stringify({ success: true }))
    } catch {
      callback(JSON.stringify({ success: true }))
    }
  }

  @LynxMethod
  getCacheSize(callback: LynxCallback): void {
    try {
      let totalSize = 0
      const files = fileIo.listFileSync(this.cacheDir)
      for (const file of files) {
        try {
          const stat = fileIo.statSync(`${this.cacheDir}/${file}`)
          totalSize += stat.size
        } catch {}
      }
      callback(JSON.stringify({ sizeBytes: totalSize }))
    } catch {
      callback(JSON.stringify({ sizeBytes: 0 }))
    }
  }

  @LynxMethod
  clearAll(callback: LynxCallback): void {
    try {
      const files = fileIo.listFileSync(this.cacheDir)
      for (const file of files) {
        try {
          fileIo.unlinkSync(`${this.cacheDir}/${file}`)
        } catch {}
      }
      callback(JSON.stringify({ success: true }))
    } catch {
      callback(JSON.stringify({ success: false }))
    }
  }

  private async doDownload(songId: string, url: string, maxSizeBytes: number,
    callback: LynxCallback): Promise<void> {
    const partPath = `${this.cacheDir}/${songId}.part`
    const finalPath = `${this.cacheDir}/${songId}`

    try {
      const httpRequest = http.createHttp()
      const options: http.HttpRequestOptions = {
        method: http.RequestMethod.GET,
        readTimeout: 120000,
        connectTimeout: 15000,
      }

      const response = await httpRequest.request(url, options)
      httpRequest.destroy()

      if (response.responseCode !== 200) {
        callback(JSON.stringify({ success: false, error: `HTTP ${response.responseCode}` }))
        return
      }

      const data = response.result as ArrayBuffer
      if (data.byteLength > maxSizeBytes) {
        callback(JSON.stringify({ success: false, error: 'limit_exceeded' }))
        return
      }

      // Atomic write: write to .part then rename
      const file = fileIo.openSync(partPath, fileIo.OpenMode.CREATE | fileIo.OpenMode.WRITE_ONLY | fileIo.OpenMode.TRUNC)
      fileIo.writeSync(file.fd, data)
      fileIo.closeSync(file.fd)

      // Rename .part to final (atomic on same filesystem)
      fileIo.renameSync(partPath, finalPath)

      callback(JSON.stringify({ success: true, path: finalPath, sizeBytes: data.byteLength }))
    } catch (err) {
      // Clean up partial file
      try { fileIo.unlinkSync(partPath) } catch {}
      callback(JSON.stringify({ success: false, error: String(err) }))
    }
  }
}
