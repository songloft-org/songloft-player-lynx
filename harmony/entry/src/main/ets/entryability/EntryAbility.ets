import { UIAbility, AbilityConstant, Want } from '@kit.AbilityKit'
import { window } from '@kit.ArkUI'
import { LynxLogService } from '@lynx/lynx_log_service'
import { LynxEnv, LynxServiceCenter, LynxServiceType } from '@lynx/lynx'
import { LynxImageService } from '@lynx/lynx_image_service'
import { SongloftHttpService } from '../net/SongloftHttpService'
import { SystemAppearance } from '../modules/system/SystemAppearance'
import { SongloftVideoModule } from '../modules/video/SongloftVideoModule'
import { AppLifecycle } from '../modules/system/AppLifecycle'

export default class EntryAbility extends UIAbility {
  onCreate(want: Want, launchParam: AbilityConstant.LaunchParam): void {
    LynxServiceCenter.registerService(LynxServiceType.Image, LynxImageService.instance)
    SongloftHttpService.register()
    LynxEnv.initialize(this.context)
    void(LynxLogService.instance)
  }

  onDestroy(): void {
    AppLifecycle.reset()
    SongloftVideoModule.setHostWindow(null)
  }

  onWindowStageCreate(windowStage: window.WindowStage): void {
    const mainWindow = windowStage.getMainWindowSync()
    // The video module needs a window handle for orientation locks — same wire
    // Android's SongloftVideoModule.setActivity provides, and iOS's
    // setHostController on ViewController.
    SongloftVideoModule.setHostWindow(mainWindow)
    this.observeWindowSize(mainWindow)
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

  onWindowStageDestroy(): void { AppLifecycle.reset() }

  onForeground(): void { AppLifecycle.enterForeground() }

  onBackground(): void { AppLifecycle.enterBackground() }

  /**
   * Push `SongloftVideo.orientationChanged` whenever the window resizes —
   * device rotation is the only real driver on phone/tablet form factors,
   * and the new size arrives here before the page rebuilds. Same channel as
   * Android's `onConfigurationChanged` and iOS's `viewWillTransition`.
   */
  private observeWindowSize(mainWindow: window.Window): void {
    mainWindow.on('windowSizeChange', (size: window.Size) => {
      const orientation: 'portrait' | 'landscape' =
        size.width > size.height ? 'landscape' : 'portrait'
      SongloftVideoModule.emitOrientation(orientation, size.width, size.height)
    })
  }
}
