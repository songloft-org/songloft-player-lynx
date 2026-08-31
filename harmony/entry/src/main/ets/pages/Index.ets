import { common } from '@kit.AbilityKit'
import { Behavior, BehaviorRegistryMap, LynxView, MetaData, ModuleClassWrapper, TemplateBundle, TemplateData, LynxContext, LynxGenericResourceFetcher, LynxMediaResourceFetcher } from '@lynx/lynx'
import { UISVG } from '@lynx/xelement_svg'
import { SongloftGenericResourceFetcher } from '../net/SongloftGenericResourceFetcher'
import { SongloftMediaResourceFetcher } from '../net/SongloftMediaResourceFetcher'
import { SongloftAudioModule } from '../modules/audio/SongloftAudioModule'
import { SongloftStorageModule } from '../modules/storage/SongloftStorageModule'
import { SongloftPlatformModule } from '../modules/platform/SongloftPlatformModule'
import { SongloftDlnaModule } from '../modules/dlna/SongloftDlnaModule'
import { SongloftVideoModule } from '../modules/video/SongloftVideoModule'
import { SongloftSongCacheModule } from '../modules/cache/SongloftSongCacheModule'
import { SongloftNavigationModule } from '../modules/navigation/SongloftNavigationModule'
import { SongloftPluginBridgeModule } from '../modules/plugin/SongloftPluginBridgeModule'
import { SystemAppearance } from '../modules/system/SystemAppearance'

@Entry
@Component
struct Index {
  private context: common.UIAbilityContext = getContext(this) as common.UIAbilityContext
  private modules: Map<string, ModuleClassWrapper> = new Map()
  private behaviors: BehaviorRegistryMap = new Map([['svg', new Behavior(UISVG, undefined)]])
  private templateBundle?: TemplateBundle = undefined
  private metaData: MetaData = new MetaData()
  private genericResourceFetcher: LynxGenericResourceFetcher = new SongloftGenericResourceFetcher()
  private mediaResourceFetcher: LynxMediaResourceFetcher = new SongloftMediaResourceFetcher()

  aboutToAppear(): void {
    this.modules.set('SongloftAudio', { moduleClass: SongloftAudioModule, param: this.context })
    this.modules.set('SongloftStorage', { moduleClass: SongloftStorageModule, param: this.context })
    this.modules.set('SongloftPlatform', { moduleClass: SongloftPlatformModule, param: this.context })
    this.modules.set('SongloftDlna', { moduleClass: SongloftDlnaModule, param: this.context })
    this.modules.set('SongloftVideo', { moduleClass: SongloftVideoModule, param: this.context })
    this.modules.set('SongloftSongCache', { moduleClass: SongloftSongCacheModule, param: this.context })
    this.modules.set('SongloftNavigation', { moduleClass: SongloftNavigationModule, param: this.context })
    this.modules.set('SongloftPluginBridge', { moduleClass: SongloftPluginBridgeModule, param: this.context })

    const globalProps = SystemAppearance.getInitialProps(this.context)
    this.metaData = new MetaData(undefined, new TemplateData(JSON.stringify(globalProps)))

    const resourceMgr = this.context.resourceManager
    const bundleBuffer = resourceMgr.getRawFileContentSync('main.lynx.bundle').buffer as ArrayBuffer
    this.templateBundle = TemplateBundle.fromTemplate(bundleBuffer)
  }

  build() {
    Stack() {
      LynxView({
        templateBundle: this.templateBundle,
        modules: this.modules,
        behaviors: this.behaviors,
        metaData: this.metaData,
        genericResourceFetcher: this.genericResourceFetcher,
        mediaResourceFetcher: this.mediaResourceFetcher,
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
