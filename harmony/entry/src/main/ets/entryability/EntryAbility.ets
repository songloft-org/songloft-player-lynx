import { UIAbility, AbilityConstant, Want } from '@kit.AbilityKit'
import { window } from '@kit.ArkUI'
import { LynxLogService } from '@lynx/lynx_log_service'
import { LynxEnv, LynxServiceCenter, LynxServiceType } from '@lynx/lynx'
import { LynxImageService } from '@lynx/lynx_image_service'
import { SongloftHttpService } from '../net/SongloftHttpService'
import { SystemAppearance } from '../modules/system/SystemAppearance'

export default class EntryAbility extends UIAbility {
  onCreate(want: Want, launchParam: AbilityConstant.LaunchParam): void {
    LynxServiceCenter.registerService(LynxServiceType.Image, LynxImageService.instance)
    SongloftHttpService.register()
    LynxEnv.initialize(this.context)
    void(LynxLogService.instance)
  }

  onDestroy(): void {}

  onWindowStageCreate(windowStage: window.WindowStage): void {
    const mainWindow = windowStage.getMainWindowSync()
    mainWindow.setWindowLayoutFullScreen(true).then(() => {
      SystemAppearance.setWindow(mainWindow)
    }).finally(() => {
      windowStage.loadContent('pages/Index', (err) => {
        if (err?.code) {
          console.error(`Failed to load content: ${err.code}`)
        }
      })
    })
  }

  onWindowStageDestroy(): void {}

  onForeground(): void {}

  onBackground(): void {}
}
