import { LynxView, LynxViewConfig } from '@aspect/lynx'
import { common } from '@kit.AbilityKit'
import { SystemAppearance } from '../modules/system/SystemAppearance'
import { SongloftNavigationModule } from '../modules/navigation/SongloftNavigationModule'

@Entry
@Component
struct Index {
  private context = getContext(this) as common.UIAbilityContext
  private lynxViewConfig: LynxViewConfig = new LynxViewConfig()

  aboutToAppear(): void {
    this.lynxViewConfig.setTemplateBundle(this.loadBundle())
    this.lynxViewConfig.setGlobalProps(SystemAppearance.getInitialProps(this.context))
  }

  private loadBundle(): ArrayBuffer {
    const resourceMgr = this.context.resourceManager
    return resourceMgr.getRawFileContentSync('main.lynx.bundle').buffer as ArrayBuffer
  }

  onBackPress(): boolean {
    return SongloftNavigationModule.handleBackPress()
  }

  build() {
    Stack() {
      LynxView({
        config: this.lynxViewConfig,
      })
        .width('100%')
        .height('100%')
    }
    .width('100%')
    .height('100%')
  }
}
