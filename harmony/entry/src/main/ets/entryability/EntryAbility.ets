import { UIAbility, AbilityConstant, Want } from '@kit.AbilityKit'
import { window } from '@kit.ArkUI'
import { LynxEnv } from '@lynx/lynx'
import { SongloftAudioModule } from '../modules/audio/SongloftAudioModule'
import { SongloftStorageModule } from '../modules/storage/SongloftStorageModule'
import { SongloftPlatformModule } from '../modules/platform/SongloftPlatformModule'
import { SongloftDlnaModule } from '../modules/dlna/SongloftDlnaModule'
import { SongloftVideoModule } from '../modules/video/SongloftVideoModule'
import { SongloftSongCacheModule } from '../modules/cache/SongloftSongCacheModule'
import { SongloftNavigationModule } from '../modules/navigation/SongloftNavigationModule'
import { SongloftHttpService } from '../net/SongloftHttpService'

export default class EntryAbility extends UIAbility {
  onCreate(want: Want, launchParam: AbilityConstant.LaunchParam): void {
    const lynxEnv: LynxEnv = LynxEnv.getInstance()
    lynxEnv.init(this.context)

    SongloftHttpService.register(lynxEnv)

    lynxEnv.registerModule('SongloftAudio', SongloftAudioModule)
    lynxEnv.registerModule('SongloftStorage', SongloftStorageModule)
    lynxEnv.registerModule('SongloftPlatform', SongloftPlatformModule)
    lynxEnv.registerModule('SongloftDlna', SongloftDlnaModule)
    lynxEnv.registerModule('SongloftVideo', SongloftVideoModule)
    lynxEnv.registerModule('SongloftSongCache', SongloftSongCacheModule)
    lynxEnv.registerModule('SongloftNavigation', SongloftNavigationModule)
  }

  onDestroy(): void {
    SongloftAudioModule.release()
  }

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
