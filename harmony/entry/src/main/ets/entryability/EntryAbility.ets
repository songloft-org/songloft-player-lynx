import { UIAbility, AbilityConstant, Want } from '@kit.AbilityKit'
import { window } from '@kit.ArkUI'
import { LynxEnv, LynxServiceCenter, LynxServiceType } from '@lynx/lynx'
import { LynxImageService } from '@lynx/lynx_image_service'
import { SongloftHttpService } from '../net/SongloftHttpService'

export default class EntryAbility extends UIAbility {
  onCreate(want: Want, launchParam: AbilityConstant.LaunchParam): void {
    LynxServiceCenter.registerService(LynxServiceType.Image, LynxImageService.instance)
    LynxServiceCenter.registerService(LynxServiceType.Http, SongloftHttpService.instance)
    LynxEnv.initialize(this.context)
  }

  onDestroy(): void {}

  onWindowStageCreate(windowStage: window.WindowStage): void {
    windowStage.loadContent('pages/Index', (err) => {
      if (err.code) {
        console.error(`Failed to load content: ${err.code}`)
        return
      }
    })
  }

  onWindowStageDestroy(): void {}

  onForeground(): void {}

  onBackground(): void {}
}
