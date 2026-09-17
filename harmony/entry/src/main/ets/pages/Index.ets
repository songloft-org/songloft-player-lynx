import { common } from '@kit.AbilityKit'
import { Behavior, BehaviorRegistryMap, LynxView, MetaData, ModuleClassWrapper, TemplateBundle, TemplateData, LynxContext, LynxGenericResourceFetcher, LynxMediaResourceFetcher } from '@lynx/lynx'
import { UISVG } from '@lynx/xelement_svg'
import { UIWebView } from '@lynx/xelement_webview'
import { SongloftGenericResourceFetcher } from '../net/SongloftGenericResourceFetcher'
import { SongloftMediaResourceFetcher } from '../net/SongloftMediaResourceFetcher'
import { SongloftAudioModule } from '../modules/audio/SongloftAudioModule'
import { SongloftStorageModule } from '../modules/storage/SongloftStorageModule'
import { SongloftPlatformModule } from '../modules/platform/SongloftPlatformModule'
import { SongloftDlnaModule } from '../modules/dlna/SongloftDlnaModule'
import { SongloftSongCacheModule } from '../modules/cache/SongloftSongCacheModule'
import { SongloftNavigationModule } from '../modules/navigation/SongloftNavigationModule'
import { SongloftPluginBridgeModule } from '../modules/plugin/SongloftPluginBridgeModule'
import { SongloftVideoModule, SongloftVideoState } from '../modules/video/SongloftVideoModule'
import { SystemAppearance } from '../modules/system/SystemAppearance'

@Entry
@Component
struct Index {
  private context: common.UIAbilityContext = getContext(this) as common.UIAbilityContext
  private modules: Map<string, ModuleClassWrapper> = new Map()
  private behaviors: BehaviorRegistryMap = new Map([
    ['svg', new Behavior(UISVG, undefined)],
    ['webview', new Behavior(UIWebView, undefined)],
  ])
  /**
   * Video state, driven by [SongloftVideoModule]. `@StorageLink`-style sharing
   * isn't right here — the module writes through the static `shared` instance
   * so the state persists across LynxView reloads; the `@State` here is what
   * makes ArkUI re-run `build()` on any field change.
   */
  @State private videoState: SongloftVideoState = SongloftVideoState.shared
  private xcomponentController: XComponentController = new XComponentController()
  private templateBundle?: TemplateBundle = undefined
  private metaData: MetaData = new MetaData()
  private genericResourceFetcher: LynxGenericResourceFetcher = new SongloftGenericResourceFetcher()
  private mediaResourceFetcher: LynxMediaResourceFetcher = new SongloftMediaResourceFetcher()

  aboutToAppear(): void {
    this.modules.set('SongloftAudio', { moduleClass: SongloftAudioModule, param: this.context })
    this.modules.set('SongloftStorage', { moduleClass: SongloftStorageModule, param: this.context })
    this.modules.set('SongloftPlatform', { moduleClass: SongloftPlatformModule, param: this.context })
    this.modules.set('SongloftDlna', { moduleClass: SongloftDlnaModule, param: this.context })
    this.modules.set('SongloftSongCache', { moduleClass: SongloftSongCacheModule, param: this.context })
    this.modules.set('SongloftNavigation', { moduleClass: SongloftNavigationModule, param: this.context })
    this.modules.set('SongloftPluginBridge', { moduleClass: SongloftPluginBridgeModule, param: this.context })
    this.modules.set('SongloftVideo', { moduleClass: SongloftVideoModule, param: this.context })

    const globalProps = SystemAppearance.getInitialProps(this.context)
    this.metaData = new MetaData(undefined, new TemplateData(JSON.stringify(globalProps)))

    const resourceMgr = this.context.resourceManager
    const bundleBuffer = resourceMgr.getRawFileContentSync('main.lynx.bundle').buffer as ArrayBuffer
    this.templateBundle = TemplateBundle.fromTemplate(bundleBuffer)
  }

  build() {
    Stack() {
      /**
       * Video surface, positioned by JS through `SongloftVideo.setSurfaceLayout`.
       * Built first so it sits **below** the LynxView — Android and iOS keep
       * the same z-order (SurfaceView + `setZOrderMediaOverlay(true)` on
       * Android, AVPlayerLayer host on iOS).
       *
       * `hitTestBehavior: NONE` lets `bindtap` on the page reach through to
       * the JS control layer instead of being swallowed by the XComponent.
       */
      XComponent({
        id: 'songloft-video',
        type: XComponentType.SURFACE,
        controller: this.xcomponentController,
      })
        .onLoad(() => {
          void SongloftVideoModule.bindSurface(this.xcomponentController.getXComponentSurfaceId())
        })
        .onDestroy(() => {
          SongloftVideoModule.unbindSurface()
        })
        .position({ x: `${this.videoState.rectX}vp`, y: `${this.videoState.rectY}vp` })
        .width(this.videoState.rectWidth > 0 ? `${this.videoState.rectWidth}vp` : '100%')
        .height(this.videoState.rectHeight > 0 ? `${this.videoState.rectHeight}vp` : '100%')
        .visibility(this.videoState.visible ? Visibility.Visible : Visibility.Hidden)
        .hitTestBehavior(HitTestMode.None)

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
