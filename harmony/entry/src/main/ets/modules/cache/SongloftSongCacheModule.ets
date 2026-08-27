import { fileIo } from '@kit.CoreFileKit'
import { http } from '@kit.NetworkKit'
import { LynxModule, LynxContext } from '@lynx/lynx'
import { common } from '@kit.AbilityKit'
import { InsecureTls } from '../../net/InsecureTls'

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

  public download(songId: string, url: string, ext: string, maxBytes: number,
    callback: (result: string) => void): void {
    this.doDownload(songId, url, ext, maxBytes, callback)
  }

  public getCacheInfo(songId: string, callback: (result: string) => void): void {
    const files = this.findCacheFile(songId)
    if (files) {
      try {
        const stat = fileIo.statSync(files)
        callback(JSON.stringify({
          cached: true,
          url: `file://${files}`,
          sizeBytes: stat.size,
        }))
      } catch (e) {
        callback(JSON.stringify({ cached: false }))
      }
    } else {
      callback(JSON.stringify({ cached: false }))
    }
  }

  public remove(songId: string, callback: (result: string) => void): void {
    const file = this.findCacheFile(songId)
    if (file) {
      try {
        fileIo.unlinkSync(file)
      } catch (e) {
        // ignore
      }
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
      callback(JSON.stringify({ bytes: totalSize }))
    } catch (e) {
      callback(JSON.stringify({ bytes: 0 }))
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

  private findCacheFile(songId: string): string | null {
    try {
      const files = fileIo.listFileSync(this.cacheDir)
      for (const file of files) {
        if (file === songId || file.startsWith(songId + '.')) {
          return `${this.cacheDir}/${file}`
        }
      }
    } catch (e) {
      // ignore
    }
    return null
  }

  private async doDownload(songId: string, url: string, ext: string, maxBytes: number,
    callback: (result: string) => void): Promise<void> {
    const fileName = ext ? `${songId}.${ext}` : songId
    const partPath = `${this.cacheDir}/${fileName}.part`
    const finalPath = `${this.cacheDir}/${fileName}`

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
      if (data.byteLength > maxBytes) {
        callback(JSON.stringify({ success: false, error: 'limit_exceeded' }))
        return
      }

      const file = fileIo.openSync(partPath,
        fileIo.OpenMode.CREATE | fileIo.OpenMode.WRITE_ONLY | fileIo.OpenMode.TRUNC)
      fileIo.writeSync(file.fd, data)
      fileIo.closeSync(file.fd)

      fileIo.renameSync(partPath, finalPath)

      callback(JSON.stringify({ success: true, url: `file://${finalPath}`, sizeBytes: data.byteLength }))
    } catch (err) {
      try { fileIo.unlinkSync(partPath) } catch (e) { /* ignore */ }
      callback(JSON.stringify({ success: false, error: String(err) }))
    }
  }
}
