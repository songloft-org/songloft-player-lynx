import { picker, fileIo, fileUri } from '@kit.CoreFileKit'
import { Want, common } from '@kit.AbilityKit'
import { systemShare } from '@kit.ShareKit'
import { uniformTypeDescriptor } from '@kit.ArkData'
import { util } from '@kit.ArkTS'
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

  public setClipboard(text: string): void {}

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
          readTimeout: 60000,
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
      // The name comes from our own TS layer, but strip separators anyway so
      // it cannot escape the cache directory.
      const safeName = fileName.split('/').pop() ?? 'file'
      const path = `${this.abilityContext.cacheDir}/${safeName}`
      const bytes = new util.Base64Helper().decodeSync(base64)
      const file = fileIo.openSync(path,
        fileIo.OpenMode.READ_WRITE | fileIo.OpenMode.CREATE | fileIo.OpenMode.TRUNC)
      try {
        file.writeSync(bytes.buffer)
      } finally {
        fileIo.closeSync(file.fd)
      }
      const data = new systemShare.SharedData({
        utd: uniformTypeDescriptor.UTD.General.FILE,
        uri: fileUri.getUriFromPath(path),
      })
      const controller = new systemShare.ShareController(data)
      controller.show(this.abilityContext)
        .then(() => callback(null))
        .catch((err: Error) => callback(err.message))
    } catch (err) {
      callback(String(err))
    }
  }
}
