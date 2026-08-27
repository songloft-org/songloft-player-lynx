import { picker } from '@kit.CoreFileKit'
import { Want, common } from '@kit.AbilityKit'
import { fileIo } from '@kit.CoreFileKit'
import { LynxModule, LynxMethod, LynxCallback } from '@aspect/lynx'
import { InsecureTls } from '../../net/InsecureTls'

/**
 * SongloftPlatform — file picker, URL open, insecureTls toggle, shareFile.
 *
 * Method names match Android/iOS byte-for-byte (gate-verified).
 */
@LynxModule('SongloftPlatform')
export class SongloftPlatformModule {
  private context: common.UIAbilityContext

  constructor(context: common.UIAbilityContext) {
    this.context = context
  }

  @LynxMethod
  getServerMode(callback: LynxCallback): void {
    // standalone mode — harmony build is always standalone
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

    documentPicker.select(options).then((result) => {
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

    documentPicker.select(options).then(async (result) => {
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

        // Upload via fetch (uses our custom HTTP service with InsecureTls)
        const response = await fetch(serverUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/octet-stream' },
          body: buffer,
        })

        if (response.ok) {
          const text = await response.text()
          callback(JSON.stringify({ success: true, body: text }))
        } else {
          callback(JSON.stringify({ success: false, error: `HTTP ${response.status}` }))
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
    // On HarmonyOS, use the system share panel
    const want: Want = {
      action: 'ohos.want.action.sendData',
      uri: filePath,
      type: mimeType,
    }
    this.context.startAbility(want).catch(() => {})
  }
}
