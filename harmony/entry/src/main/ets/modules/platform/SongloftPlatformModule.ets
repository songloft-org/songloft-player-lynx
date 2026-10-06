import { picker, fileIo, fileUri } from '@kit.CoreFileKit'
import { Want, common } from '@kit.AbilityKit'
import { systemShare } from '@kit.ShareKit'
import { uniformTypeDescriptor } from '@kit.ArkData'
import { util } from '@kit.ArkTS'
import { zlib, pasteboard, BusinessError } from '@kit.BasicServicesKit'
import { http } from '@kit.NetworkKit'
import { LynxModule, LynxContext } from '@lynx/lynx'
import { InsecureTls } from '../../net/InsecureTls'
import { ClientFileLog } from './ClientFileLog'

export class SongloftPlatformModule extends LynxModule {
  private abilityContext: common.UIAbilityContext

  constructor(context: LynxContext, param?: Object) {
    super(context, param)
    this.abilityContext = param as common.UIAbilityContext
    // Same shared log file the audio module writes; idempotent.
    ClientFileLog.init(this.abilityContext)
  }

  public openURL(url: string): void {
    const want: Want = {
      action: 'ohos.want.action.viewData',
      uri: url,
    }
    this.abilityContext.startAbility(want).catch(() => {})
  }

  public setClipboard(text: string): void {
    this.setClipboardWithResult(text, (error: string | null): void => {})
  }

  public setClipboardWithResult(text: string, callback: (error: string | null) => void): void {
    try {
      const data: pasteboard.PasteData = pasteboard.createData(pasteboard.MIMETYPE_TEXT_PLAIN, text)
      pasteboard.getSystemPasteboard().setData(data).then((): void => {
        callback(null)
      }, (error: BusinessError): void => {
        callback('clipboard_failed')
      })
    } catch {
      callback('clipboard_failed')
    }
  }

  public setInsecureTls(enabled: boolean): void {
    InsecureTls.setEnabled(enabled)
  }

  public pickAndUploadFile(uploadUrl: string, fieldName: string, mimeType: string,
    callback: (error: string | null, responseBody: string | null) => void): void {
    const documentPicker = new picker.DocumentViewPicker(this.abilityContext)
    const options = new picker.DocumentSelectOptions()
    options.maxSelectNumber = 1

    documentPicker.select(options).then(async (result: Array<string>) => {
      if (!result || result.length === 0) {
        callback('cancelled', null)
        return
      }
      try {
        const uri = result[0]
        const file = fileIo.openSync(uri, fileIo.OpenMode.READ_ONLY)
        const stat = fileIo.statSync(file.fd)
        const buffer = new ArrayBuffer(stat.size)
        fileIo.readSync(file.fd, buffer)
        fileIo.closeSync(file.fd)

        const httpRequest = http.createHttp()
        const httpOptions: http.HttpRequestOptions = {
          method: http.RequestMethod.POST,
          header: { 'Content-Type': 'application/octet-stream' },
          extraData: buffer,
          readTimeout: uploadUrl.split('?')[0].endsWith('/api/v1/jsplugins/upload') ? 240000 : 60000,
          connectTimeout: 15000,
        }
        const response = await httpRequest.request(uploadUrl, httpOptions)
        httpRequest.destroy()

        if (response.responseCode >= 200 && response.responseCode < 300) {
          const body = typeof response.result === 'string'
            ? response.result
            : JSON.stringify(response.result)
          callback(null, body)
        } else {
          callback(`HTTP ${response.responseCode}`, null)
        }
      } catch (err) {
        callback(String(err), null)
      }
    }).catch((err: Error) => {
      callback(err.message, null)
    })
  }

  /** Append one already-formatted line (the TS `logWrite` path). */
  public logWrite(line: string): void {
    ClientFileLog.writeRaw(line)
  }

  /** Read the current client log file; content is `null` when no file exists. */
  public logRead(callback: (error: string | null, content: string | null) => void): void {
    ClientFileLog.read(callback)
  }

  /**
   * Decode a base64 payload into the cache dir and raise the system share
   * panel (Share Kit) — HarmonyOS's counterpart of the Android chooser and the
   * iOS `UIActivityViewController`. The callback fires once the panel was
   * raised (not when the user finishes sharing — the OS gives no completion
   * signal worth waiting for), matching the iOS host.
   */
  public shareFile(base64: string, fileName: string, mimeType: string,
    callback: (error: string | null) => void): void {
    try {
      const path = `${this.abilityContext.cacheDir}/${this.safeName(fileName, 'file')}`
      const bytes = new util.Base64Helper().decodeSync(base64)
      const file = fileIo.openSync(path,
        fileIo.OpenMode.READ_WRITE | fileIo.OpenMode.CREATE | fileIo.OpenMode.TRUNC)
      try {
        fileIo.writeSync(file.fd, bytes.buffer)
      } finally {
        fileIo.closeSync(file.fd)
      }
      this.presentShareSheet(path)
        .then(() => callback(null))
        .catch((err: Error) => callback(SongloftPlatformModule.errorText(err)))
    } catch (err) {
      callback(String(err))
    }
  }

  /**
   * Build the log archive here and raise the share panel — the fast path behind
   * `SongloftPlatform.shareLogArchive`.
   *
   * Why it exists next to `shareFile`: the JS layer used to fetch the backend log
   * (≤10 MiB) and read this app's client log (≤20 MB) into JS strings, deflate
   * both with a pure-JS zipper and base64 the result by hand — on the JS thread
   * of an engine with no JIT — then push the payload back across the bridge.
   * That pause in front of the share panel is songloft-player-lynx#3.
   *
   * `backendLogUrl` empty skips the backend side. `authHeader` is sent verbatim
   * as `Authorization` (empty = no header). A backend failure writes
   * `backend-error.txt` into the archive rather than failing the export — the
   * semantic the JS path and the Flutter reference both keep.
   *
   * Callback receives (error-or-null, `{"hasBackend":…,"hasFrontend":…}`).
   */
  public shareLogArchive(backendLogUrl: string, authHeader: string, fileName: string,
    callback: (error: string | null, resultJson: string | null) => void): void {
    this.buildAndShareLogArchive(backendLogUrl, authHeader, fileName)
      .then((result: string) => callback(null, result))
      .catch((err: Error) => callback(SongloftPlatformModule.errorText(err), null))
  }

  /**
   * A **non-empty** message for a rejected promise. The TS facade decides
   * "failed" from this argument, and a blank one would be read as success — so
   * an exception without a usable message must still produce a sentinel.
   */
  private static errorText(err: Error): string {
    const message: string = `${err.message}`.trim()
    return message.length > 0 ? message : 'archive_failed'
  }

  private async buildAndShareLogArchive(backendLogUrl: string, authHeader: string,
    fileName: string): Promise<string> {
    const safeName = this.safeName(fileName, 'songloft-logs.zip')
    const baseName = safeName.endsWith('.zip')
      ? safeName.substring(0, safeName.length - 4)
      : safeName
    const container = `${this.abilityContext.cacheDir}/${SongloftPlatformModule.LOG_EXPORT_DIR}`
    // `compressFile` archives a directory, and its name is what whoever opens
    // the zip sees — so name it after the archive rather than leaking a scratch
    // name.
    const staging = `${container}/${baseName.length > 0 ? baseName : 'songloft-logs'}`

    // A leftover staging dir from an interrupted run would ship stale logs
    // inside this archive.
    SongloftPlatformModule.removeDir(container)
    fileIo.mkdirSync(container)
    fileIo.mkdirSync(staging)

    const hasBackend = backendLogUrl.length > 0
      ? await this.downloadBackendLog(backendLogUrl, authHeader, staging)
      : false

    const frontend = `${staging}/${SongloftPlatformModule.ENTRY_FRONTEND}`
    const hasFrontend = ClientFileLog.copyTo(frontend) > 0

    if (fileIo.listFileSync(staging).length === 0) {
      SongloftPlatformModule.removeDir(container)
      // Same message as the JS path, so the toast reads identically whichever
      // path ran.
      throw new Error('no logs to export')
    }

    const archive = `${this.abilityContext.cacheDir}/${safeName}`
    try {
      fileIo.unlinkSync(archive)
    } catch (err) {
      // No previous archive to replace.
    }
    await zlib.compressFile(staging, archive,
      { level: zlib.CompressLevel.COMPRESS_LEVEL_DEFAULT_COMPRESSION })
    SongloftPlatformModule.removeDir(container)

    await this.presentShareSheet(archive)
    return `{"hasBackend":${hasBackend},"hasFrontend":${hasFrontend}}`
  }

  /**
   * GET `url` into `staging/backend.log`. True when the file ended up with
   * content; every failure writes `backend-error.txt` instead, so a missing
   * backend side never fails the export.
   *
   * `remoteValidation` follows the user's insecure-TLS switch: a self-signed LAN
   * server is the common setup, and an export has to work when things are
   * broken.
   */
  private async downloadBackendLog(url: string, authHeader: string,
    staging: string): Promise<boolean> {
    const target = `${staging}/${SongloftPlatformModule.ENTRY_BACKEND}`
    const httpRequest = http.createHttp()
    try {
      const header: Record<string, string> = {}
      if (authHeader.length > 0) {
        header['Authorization'] = authHeader
      }
      const options: http.HttpRequestOptions = {
        method: http.RequestMethod.GET,
        header: header,
        expectDataType: http.HttpDataType.ARRAY_BUFFER,
        readTimeout: 60000,
        connectTimeout: 15000,
        remoteValidation: InsecureTls.isEnabled() ? 'skip' : 'system',
      }
      const response = await httpRequest.request(url, options)
      if (response.responseCode < 200 || response.responseCode > 299) {
        this.writeBackendError(staging, `HTTP ${response.responseCode}`)
        return false
      }
      const data = response.result as ArrayBuffer
      if (data.byteLength === 0) {
        // An empty side is omitted silently, not reported as a failure.
        return false
      }
      const file = fileIo.openSync(target,
        fileIo.OpenMode.CREATE | fileIo.OpenMode.WRITE_ONLY | fileIo.OpenMode.TRUNC)
      try {
        fileIo.writeSync(file.fd, data)
      } finally {
        fileIo.closeSync(file.fd)
      }
      return true
    } catch (err) {
      try {
        fileIo.unlinkSync(target)
      } catch (e) {
        // Nothing to clean up.
      }
      this.writeBackendError(staging, String(err))
      return false
    } finally {
      httpRequest.destroy()
    }
  }

  private writeBackendError(staging: string, reason: string): void {
    try {
      const path = `${staging}/${SongloftPlatformModule.ENTRY_BACKEND_ERROR}`
      const file = fileIo.openSync(path,
        fileIo.OpenMode.CREATE | fileIo.OpenMode.WRITE_ONLY | fileIo.OpenMode.TRUNC)
      try {
        fileIo.writeSync(file.fd, `Failed to fetch backend logs: ${reason}\n`)
      } finally {
        fileIo.closeSync(file.fd)
      }
    } catch (err) {
      // The note is a courtesy to whoever reads the archive; losing it must not
      // lose the export.
    }
  }

  /** Raise the system share panel (Share Kit) for a file already on disk. */
  private presentShareSheet(path: string): Promise<void> {
    const data = new systemShare.SharedData({
      utd: uniformTypeDescriptor.UniformDataType.FILE,
      uri: fileUri.getUriFromPath(path),
    })
    const controller = new systemShare.ShareController(data)
    return controller.show(this.abilityContext, {
      selectionMode: systemShare.SelectionMode.SINGLE,
      previewMode: systemShare.SharePreviewMode.DETAIL,
    })
  }

  /**
   * Last path segment. The name comes from our own TS layer, but a separator
   * here would escape the cache directory.
   */
  private safeName(fileName: string, fallback: string): string {
    const last = fileName.split('/').pop()
    return last !== undefined && last.length > 0 ? last : fallback
  }

  private static removeDir(path: string): void {
    try {
      fileIo.rmdirSync(path)
    } catch (err) {
      // Nothing there yet, or already gone.
    }
  }

  private static readonly LOG_EXPORT_DIR: string = 'logexport'
  private static readonly ENTRY_BACKEND: string = 'backend.log'
  private static readonly ENTRY_BACKEND_ERROR: string = 'backend-error.txt'
  private static readonly ENTRY_FRONTEND: string = 'frontend.log'
}
