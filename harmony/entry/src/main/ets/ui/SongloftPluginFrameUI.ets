import { common } from '@kit.AbilityKit'
import { BuilderNode } from '@kit.ArkUI'
import {
  BehaviorRegistryMap,
  IContext,
  LynxContext,
  LynxError,
  LynxGenericResourceFetcher,
  LynxMediaResourceFetcher,
  LynxTemplateResourceFetcher,
  LynxView,
  LynxViewClient,
  MetaData,
  ModuleClassWrapper,
  UIBase,
  TemplateData,
} from '@lynx/lynx'
import { SongloftPluginBridgeModule } from '../modules/plugin/SongloftPluginBridgeModule'
import { ClientFileLog } from '../modules/platform/ClientFileLog'

interface PluginFrameError {
  errorCode: number
}

/** A plugin gets its own bridge module, never the root's updater/lifecycle clients. */
export class SongloftPluginFrameConfig {
  modules: Map<string, ModuleClassWrapper> = new Map()
  behaviors: BehaviorRegistryMap
  genericResourceFetcher: LynxGenericResourceFetcher
  mediaResourceFetcher: LynxMediaResourceFetcher
  templateResourceFetcher: LynxTemplateResourceFetcher

  constructor(
    ability: common.UIAbilityContext,
    behaviors: BehaviorRegistryMap,
    generic: LynxGenericResourceFetcher,
    media: LynxMediaResourceFetcher,
    template: LynxTemplateResourceFetcher,
  ) {
    this.modules.set('SongloftPluginBridge', {
      moduleClass: SongloftPluginBridgeModule,
      param: ability,
    })
    this.behaviors = behaviors
    this.genericResourceFetcher = generic
    this.mediaResourceFetcher = media
    this.templateResourceFetcher = template
  }
}

class PluginFrameClient extends LynxViewClient {
  private owner: SongloftPluginFrameUI
  private generation: number

  constructor(owner: SongloftPluginFrameUI, generation: number) {
    super()
    this.owner = owner
    this.generation = generation
  }

  override onFirstScreen(): void {
    this.owner.loaded(this.generation)
  }
  override onReceivedError(error: LynxError): void {
    this.owner.failed(this.generation, error.getErrorCode())
  }
}

class PluginFrameParams {
  src: string
  metaData: MetaData
  config: SongloftPluginFrameConfig
  clients: LynxViewClient[]
  onCreate: (context: LynxContext) => void

  constructor(
    owner: SongloftPluginFrameUI,
    generation: number,
    src: string,
    metaData: MetaData,
    config: SongloftPluginFrameConfig,
  ) {
    this.src = src
    this.metaData = metaData
    this.config = config
    this.clients = [new PluginFrameClient(owner, generation)]
    this.onCreate = (context: LynxContext): void => {
      owner.attach(generation, context)
    }
  }
}

@Builder
function buildPluginFrame(params: PluginFrameParams) {
  LynxView({
    url: params.src,
    metaData: params.metaData,
    modules: params.config.modules,
    behaviors: params.config.behaviors,
    genericResourceFetcher: params.config.genericResourceFetcher,
    mediaResourceFetcher: params.config.mediaResourceFetcher,
    templateResourceFetcher: params.config.templateResourceFetcher,
    clients: params.clients,
    onCreate: params.onCreate,
  })
    .width('100%')
    .height('100%')
}

/** HarmonyOS child view for songloft-plugin-frame, independent of the SDK's frame pipeline. */
export class SongloftPluginFrameUI extends UIBase {
  private config: SongloftPluginFrameConfig
  private childNode?: BuilderNode<[PluginFrameParams]>
  private childContext?: LynxContext
  private src: string = ''
  private propsJSON: string = '{}'
  private frameId: string = ''
  private generation: number = 0
  private ready: boolean = false
  private disposed: boolean = false
  private foreground: boolean = true

  constructor(context: IContext, param?: Object) {
    super(context, param)
    this.config = param as SongloftPluginFrameConfig
  }

  override update(props: Record<string, Object>): void {
    if (this.disposed) return
    super.update(props)
    const src = props['src']
    const globalProps = props['global-props']
    const nextSrc = typeof src === 'string' ? src : this.src
    let nextJSON = this.propsJSON
    let nextId = this.frameId
    if (globalProps !== undefined) {
      nextJSON = JSON.stringify(globalProps)
      nextId = (globalProps as Record<string, Object>)['frameId'] as string
    }
    if (nextSrc !== this.src || nextId !== this.frameId) this.releaseChild()
    const propsChanged = nextJSON !== this.propsJSON
    this.src = nextSrc
    this.propsJSON = nextJSON
    this.frameId = nextId
    if (propsChanged) this.childContext?.updateMetaData(this.metaData())
    this.mount()
  }

  override onNodeReady(): void {
    this.ready = true
    this.mount()
  }

  private metaData(): MetaData {
    return new MetaData(undefined, new TemplateData(this.propsJSON))
  }

  private mount(): void {
    if (
      !this.ready ||
      this.disposed ||
      this.childNode ||
      !this.uiContext ||
      !this.src ||
      !this.frameId
    )
      return
    const generation = ++this.generation
    const node = new BuilderNode<[PluginFrameParams]>(this.uiContext)
    this.childNode = node
    const params = new PluginFrameParams(
      this,
      generation,
      this.src,
      this.metaData(),
      this.config,
    )
    node.build(wrapBuilder<[PluginFrameParams]>(buildPluginFrame), params)
    this.nativeUI?.setFrameNode(node.getFrameNode())
  }

  attach(generation: number, context: LynxContext): void {
    if (this.disposed || generation !== this.generation) return
    this.childContext = context
    // Props (notably the token) may have changed while ArkUI was creating the child.
    context.updateMetaData(this.metaData())
    if (!this.foreground) context.onEnterBackground()
  }

  loaded(generation: number): void {
    if (this.disposed || generation !== this.generation) return
    const detail: Record<string, Object> = {}
    this.sendCustomEvent('load', detail, 'detail')
  }

  failed(generation: number, code: number): void {
    if (this.disposed || generation !== this.generation) return
    // Avoid logging URLs or global props, which can contain account credentials.
    ClientFileLog.write('E', 'PluginFrame', `Lynx plugin load error ${code}`)
    const detail: PluginFrameError = { errorCode: code }
    this.sendCustomEvent('error', detail, 'detail')
  }

  protected override needWindowStateChangeEvent(): boolean {
    return true
  }
  override onEnterForeground(): void {
    this.foreground = true
    this.childContext?.onEnterForeground()
  }
  override onEnterBackground(): void {
    this.foreground = false
    this.childContext?.onEnterBackground()
  }

  private releaseChild(): void {
    ++this.generation
    if (this.childContext)
      SongloftPluginBridgeModule.detachChild(this.childContext)
    this.childContext = undefined
    this.nativeUI?.setFrameNode(null)
    this.childNode?.dispose()
    this.childNode = undefined
  }

  override layout(
    _x: number,
    _y: number,
    _width: number,
    _height: number,
    _pl: number,
    _pt: number,
    _pr: number,
    _pb: number,
    _ml: number,
    _mt: number,
    _mr: number,
    _mb: number,
    _sticky?: number[],
  ): void {}

  override dispose(): void {
    this.disposed = true
    this.releaseChild()
    super.dispose()
  }
}
