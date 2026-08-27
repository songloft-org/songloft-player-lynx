import { common } from '@kit.AbilityKit'
import { LynxView, MetaData, ModuleClassWrapper, TemplateBundle, TemplateData, LynxContext } from '@lynx/lynx'
import { SongloftAudioModule } from '../modules/audio/SongloftAudioModule'
import { SongloftStorageModule } from '../modules/storage/SongloftStorageModule'
import { SongloftPlatformModule } from '../modules/platform/SongloftPlatformModule'
import { SongloftDlnaModule } from '../modules/dlna/SongloftDlnaModule'
import { SongloftVideoModule } from '../modules/video/SongloftVideoModule'
import { SongloftSongCacheModule } from '../modules/cache/SongloftSongCacheModule'
import { SongloftNavigationModule } from '../modules/navigation/SongloftNavigationModule'
import { SystemAppearance } from '../modules/system/SystemAppearance'

@Entry
@Component
struct Index {
  private context: common.UIAbilityContext = getContext(this) as common.UIAbilityContext
  private modules: Map<string, ModuleClassWrapper> = new Map()
  private templateBundle?: TemplateBundle = undefined
  private metaData: MetaData = new MetaData()

  aboutToAppear(): void {
    this.modules.set('SongloftAudio', { moduleClass: SongloftAudioModule, param: this.context })
    this.modules.set('SongloftStorage', { moduleClass: SongloftStorageModule, param: this.context })
    this.modules.set('SongloftPlatform', { moduleClass: SongloftPlatformModule, param: this.context })
    this.modules.set('SongloftDlna', { moduleClass: SongloftDlnaModule, param: this.context })
    this.modules.set('SongloftVideo', { moduleClass: SongloftVideoModule, param: this.context })
    this.modules.set('SongloftSongCache', { moduleClass: SongloftSongCacheModule, param: this.context })
    this.modules.set('SongloftNavigation', { moduleClass: SongloftNavigationModule, param: this.context })

    const globalProps = SystemAppearance.getInitialProps(this.context)
    this.metaData = new MetaData(undefined, new TemplateData(globalProps))

    const resourceMgr = this.context.resourceManager
    const bundleBuffer = resourceMgr.getRawFileContentSync('main.lynx.bundle').buffer as ArrayBuffer
    this.templateBundle = TemplateBundle.fromTemplate(bundleBuffer)
  }

  build() {
    Stack() {
      LynxView({
        templateBundle: this.templateBundle,
        modules: this.modules,
        metaData: this.metaData,
        onCreate: (context: LynxContext) => {
          SystemAppearance.attach(context, this.context)
        }
      })
        .width('100%')
        .height('100%')
    }
    .width('100%')
    .height('100%')
  }
}
