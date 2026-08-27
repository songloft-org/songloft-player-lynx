import { fileIo } from '@kit.CoreFileKit'
import { http } from '@kit.NetworkKit'
import { LynxModule, LynxContext } from '@lynx/lynx'
import { common } from '@kit.AbilityKit'

export class SongloftSongCacheModule extends LynxModule {
  private abilityContext: common.UIAbilityContext
  private cacheDir: string

  constructor(context: LynxContext, param?: Object) {
    super(context, param)
    this.abilityContext = param as common.UIAbilityContext
    this.cacheDir = this.abilityContext.filesDir + '/song_cache'
    this.ensureCacheDir()
  }

  private ensureCacheDir(): void {
    try {
      fileIo.mkdirSync(this.cacheDir)
    } catch (e) {
      // Already exists
    }
  }

  public download(songId: string, url: string, maxSizeBytes: number,
    callback: (result: string) => void): void {
    this.doDownload(songId, url, maxSizeBytes, callback)
  }

  public getCacheInfo(songId: string, callback: (result: string) => void): void {
    const filePath = `${this.cacheDir}/${songId}`
    try {
      const stat = fileIo.statSync(filePath)
      callback(JSON.stringify({
        cached: true,
        path: filePath,
        sizeBytes: stat.size,
      }))
    } catch (e) {
      callback(JSON.stringify({ cached: false }))
    }
  }

  public remove(songId: string, callback: (result: string) => void): void {
    const filePath = `${this.cacheDir}/${songId}`
    try {
      fileIo.unlinkSync(filePath)
    } catch (e) {
      // ignore
    }
    callback(JSON.stringify({ success: true }))
  }

  public getCacheSize(callback: (result: string) => void): void {
    try {
      let totalSize = 0
      const files = fileIo.listFileSync(this.cacheDir)
      for (const file of files) {
        try {
          const stat = fileIo.statSync(`${this.cacheDir}/${file}`)
          totalSize += stat.size
        } catch (e) {
          // skip
        }
      }
      callback(JSON.stringify({ sizeBytes: totalSize }))
    } catch (e) {
      callback(JSON.stringify({ sizeBytes: 0 }))
    }
  }

  public clearAll(callback: (result: string) => void): void {
    try {
      const files = fileIo.listFileSync(this.cacheDir)
      for (const file of files) {
        try {
          fileIo.unlinkSync(`${this.cacheDir}/${file}`)
        } catch (e) {
          // skip
        }
      }
      callback(JSON.stringify({ success: true }))
    } catch (e) {
      callback(JSON.stringify({ success: false }))
    }
  }

  private async doDownload(songId: string, url: string, maxSizeBytes: number,
    callback: (result: string) => void): Promise<void> {
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

      const file = fileIo.openSync(partPath,
        fileIo.OpenMode.CREATE | fileIo.OpenMode.WRITE_ONLY | fileIo.OpenMode.TRUNC)
      fileIo.writeSync(file.fd, data)
      fileIo.closeSync(file.fd)

      fileIo.renameSync(partPath, finalPath)

      callback(JSON.stringify({ success: true, path: finalPath, sizeBytes: data.byteLength }))
    } catch (err) {
      try { fileIo.unlinkSync(partPath) } catch (e) { /* ignore */ }
      callback(JSON.stringify({ success: false, error: String(err) }))
    }
  }
}
