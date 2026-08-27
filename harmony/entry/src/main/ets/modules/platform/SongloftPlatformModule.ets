import { picker } from '@kit.CoreFileKit'
import { Want, common } from '@kit.AbilityKit'
import { fileIo } from '@kit.CoreFileKit'
import { http } from '@kit.NetworkKit'
import { LynxModule, LynxContext } from '@lynx/lynx'
import { InsecureTls } from '../../net/InsecureTls'

export class SongloftPlatformModule extends LynxModule {
  private abilityContext: common.UIAbilityContext

  constructor(context: LynxContext, param?: Object) {
    super(context, param)
    this.abilityContext = param as common.UIAbilityContext
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

  public logWrite(line: string): void {}

  public logRead(callback: (error: string | null, content: string | null) => void): void {
    callback(null, '')
  }

  public shareFile(base64: string, fileName: string, mimeType: string,
    callback: (error: string | null) => void): void {
    callback('not_supported')
  }
}
