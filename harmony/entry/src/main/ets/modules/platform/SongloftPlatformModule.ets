import { picker } from '@kit.CoreFileKit'
import { Want, common } from '@kit.AbilityKit'
import { fileIo } from '@kit.CoreFileKit'
import { http } from '@kit.NetworkKit'
import { LynxModule, LynxMethod, LynxCallback } from '@lynx/lynx'
import { InsecureTls } from '../../net/InsecureTls'

@LynxModule('SongloftPlatform')
export class SongloftPlatformModule {
  private context: common.UIAbilityContext

  constructor(context: common.UIAbilityContext) {
    this.context = context
  }

  @LynxMethod
  getServerMode(callback: LynxCallback): void {
    callback(JSON.stringify({ mode: 'standalone' }))
  }

  @LynxMethod
  setInsecureTls(enabled: boolean): void {
    InsecureTls.setEnabled(enabled)
  }

  @LynxMethod
  getInsecureTls(callback: LynxCallback): void {
    callback(JSON.stringify({ enabled: InsecureTls.isEnabled() }))
  }

  @LynxMethod
  openURL(url: string): void {
    const want: Want = {
      action: 'ohos.want.action.viewData',
      uri: url,
    }
    this.context.startAbility(want).catch(() => {})
  }

  @LynxMethod
  pickFile(mimeTypes: string, callback: LynxCallback): void {
    const documentPicker = new picker.DocumentViewPicker(this.context)
    const options = new picker.DocumentSelectOptions()
    options.maxSelectNumber = 1

    documentPicker.select(options).then((result: Array<string>) => {
      if (result && result.length > 0) {
        callback(JSON.stringify({ uri: result[0] }))
      } else {
        callback(JSON.stringify({ uri: null }))
      }
    }).catch(() => {
      callback(JSON.stringify({ uri: null }))
    })
  }

  @LynxMethod
  pickAndUploadFile(serverUrl: string, mimeTypes: string, callback: LynxCallback): void {
    const documentPicker = new picker.DocumentViewPicker(this.context)
    const options = new picker.DocumentSelectOptions()
    options.maxSelectNumber = 1

    documentPicker.select(options).then(async (result: Array<string>) => {
      if (!result || result.length === 0) {
        callback(JSON.stringify({ success: false, error: 'cancelled' }))
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
        const response = await httpRequest.request(serverUrl, httpOptions)
        httpRequest.destroy()

        if (response.responseCode >= 200 && response.responseCode < 300) {
          const body = typeof response.result === 'string'
            ? response.result
            : JSON.stringify(response.result)
          callback(JSON.stringify({ success: true, body: body }))
        } else {
          callback(JSON.stringify({ success: false, error: `HTTP ${response.responseCode}` }))
        }
      } catch (err) {
        callback(JSON.stringify({ success: false, error: String(err) }))
      }
    }).catch((err: Error) => {
      callback(JSON.stringify({ success: false, error: err.message }))
    })
  }

  @LynxMethod
  shareFile(filePath: string, mimeType: string): void {
    const want: Want = {
      action: 'ohos.want.action.sendData',
      uri: filePath,
      type: mimeType,
    }
    this.context.startAbility(want).catch(() => {})
  }
}
