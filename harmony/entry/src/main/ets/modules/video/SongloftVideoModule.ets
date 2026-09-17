import { LynxModule, LynxContext } from '@lynx/lynx'
import { common } from '@kit.AbilityKit'
import { window } from '@kit.ArkUI'
import { SongloftAudioEngine, VideoTrackState } from '../audio/SongloftAudioEngine'

/**
 * Fullscreen video playback for the song the audio engine is already holding.
 * Exposed to JS as `NativeModules.SongloftVideo`.
 *
 * The HarmonyOS counterpart of `org.songloft.lynx.video.SongloftVideoModule`
 * (Android) and `SongloftVideoModule.swift` (iOS). No URL is taken — the picture
 * comes from the stream the audio engine is already playing, so this module
 * only binds the running AVPlayer's decoder output to a hostable surface.
 *
 * The surface itself is an `XComponent` hosted from `Index.ets` **under** the
 * `LynxView`, so the JS page paints every control above the picture. This is
 * the same layering as Android's `SurfaceView + setZOrderMediaOverlay(true)`
 * and iOS's `AVPlayerLayer` on a UIView below the LynxView — one style on
 * every platform.
 *
 * ## Sizing
 *
 * The picture is *not* stretched to fill the surface: the JS page reads the
 * video's pixel dimensions from the `videoSizeChanged` event and calls
 * [setSurfaceLayout] with a letterbox / zoom rect. The host writes the rect to
 * an `@Observed` state that Index.ets's XComponent binds against — so a change
 * to the rect is what re-lays out the surface. Units are CSS-logical pixels
 * (the same unit `boundingClientRect` returns in Lynx) — HarmonyOS's own layout
 * unit is `vp`, which coincides with CSS pixels at 1× density, so no scaling
 * is needed here (unlike Android where the rect is multiplied by
 * `DisplayMetrics.density`).
 */

/**
 * Layout rect written by the module and read by Index.ets. Kept flat and
 * primitive because ArkUI's `@Observed` change detection only tracks
 * top-level property assignments — a nested object mutation would be missed.
 */
export interface VideoSurfaceRect {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Static bridge between the module (state) and the entry page (render). Splits
 * cleanly from `SongloftVideoModule` because ArkUI cannot observe a static
 * class field on a `LynxModule` subclass directly — the wrapper class carries
 * one shared instance that Index.ets can bind to.
 */
@Observed
export class SongloftVideoState {
  static shared: SongloftVideoState = new SongloftVideoState()

  /** Whether the XComponent is visible. Toggled by open()/close(). */
  visible: boolean = false
  /** Positioning driven by JS via `setSurfaceLayout`. */
  rectX: number = 0
  rectY: number = 0
  rectWidth: number = 0
  rectHeight: number = 0
  /** Filled by the XComponent when its surface is ready. Empty means no surface. */
  surfaceId: string = ''
}

export class SongloftVideoModule extends LynxModule {
  /**
   * Byte-for-byte match with `src/native/video.ts`. HarmonyOS, like Android
   * and iOS, does not push a `closed` event: the system back gesture already
   * routes to `performRouteBack` via [SongloftNavigationModule], so a second
   * close-from-host channel would be a second source of truth for the same
   * signal.
   */
  static readonly EVENT_VIDEO_SIZE_CHANGED = 'SongloftVideo.videoSizeChanged'
  static readonly EVENT_ORIENTATION_CHANGED = 'SongloftVideo.orientationChanged'

  private static readonly OPEN_TIMEOUT_MS = 8_000
  private static readonly OPENED = 'opened'
  private static readonly NO_TRACK = 'noTrack'
  private static readonly FAILED = 'failed'

  private abilityContext: common.UIAbilityContext
  /** Latched by the last constructed instance so orientation events can be pushed. */
  private static latestContext: LynxContext | null = null
  /** Set by [EntryAbility] on window-stage create; the target of orientation locks. */
  private static hostWindow: window.Window | null = null
  private static isOpen: boolean = false

  constructor(context: LynxContext, param?: Object) {
    super(context, param)
    this.abilityContext = param as common.UIAbilityContext
    SongloftVideoModule.latestContext = context
  }

  static setHostWindow(w: window.Window | null): void {
    SongloftVideoModule.hostWindow = w
  }

  /**
   * Emit the current orientation to the page. Called by [EntryAbility] from
   * `onConfigurationUpdate` (device rotation) — the counterpart of iOS's
   * `viewWillTransition` push and Android's `onConfigurationChanged` push.
   */
  static emitOrientation(orientation: 'portrait' | 'landscape',
    widthPx: number, heightPx: number): void {
    const ctx = SongloftVideoModule.latestContext
    if (!ctx) return
    const payload: Record<string, Object> = {
      'orientation': orientation,
      'width': widthPx,
      'height': heightPx,
    }
    ctx.sendGlobalEvent(SongloftVideoModule.EVENT_ORIENTATION_CHANGED, [payload])
  }

  // MARK: - open / close / isOpen

  /**
   * Show the video surface.
   *
   * Answers **why** rather than a bare boolean:
   *  - `{"result":"opened"}` — the picture is up.
   *  - `{"result":"noTrack"}` — the stream is ready but carries no video track.
   *  - `{"result":"failed"}` — the stream itself could not be loaded.
   */
  public async open(): Promise<Record<string, string>> {
    if (SongloftVideoModule.isOpen) {
      return { 'result': SongloftVideoModule.OPENED }
    }
    const engine = await SongloftAudioEngine.getInstance()
    const state = await SongloftVideoModule.decideVideoTrack(engine)
    switch (state) {
      case VideoTrackState.HAS_TRACK: {
        const shared = SongloftVideoState.shared
        shared.visible = true
        if (shared.surfaceId.length > 0) {
          const module = SongloftVideoModule
          await engine.attachVideoOutput(shared.surfaceId, (w, h) => {
            module.emitVideoSize(w, h)
          })
        }
        SongloftVideoModule.isOpen = true
        return { 'result': SongloftVideoModule.OPENED }
      }
      case VideoTrackState.NO_TRACK:
        return { 'result': SongloftVideoModule.NO_TRACK }
      default:
        return { 'result': SongloftVideoModule.FAILED }
    }
  }

  public async close(): Promise<Record<string, string>> {
    if (!SongloftVideoModule.isOpen) return {}
    const engine = await SongloftAudioEngine.getInstance()
    engine.detachVideoOutput()
    SongloftVideoState.shared.visible = false
    SongloftVideoModule.isOpen = false
    await SongloftVideoModule.releaseOrientationLock()
    return {}
  }

  public isOpen(): Record<string, boolean> {
    return { 'result': SongloftVideoModule.isOpen }
  }

  /**
   * Called by Index.ets once the XComponent's surface is ready. The id is
   * pushed here (not read back through the state object) because a page that
   * calls `open()` before the XComponent binds should still be attachable
   * later — `attachVideoOutput` re-primes the pipeline with whatever id
   * arrives after.
   */
  static async bindSurface(surfaceId: string): Promise<void> {
    SongloftVideoState.shared.surfaceId = surfaceId
    if (SongloftVideoModule.isOpen && surfaceId.length > 0) {
      const engine = await SongloftAudioEngine.getInstance()
      const module = SongloftVideoModule
      await engine.attachVideoOutput(surfaceId, (w, h) => module.emitVideoSize(w, h))
    }
  }

  static unbindSurface(): void {
    SongloftVideoState.shared.surfaceId = ''
  }

  /**
   * Wait until the item's fate is known before answering `open`.
   *
   * The AVPlayer can still be preparing when `open` arrives — treating that as
   * "no track" is the same misreport this three-way contract kills on
   * Android/iOS. Poll every 100 ms until ready / failed / deadline.
   */
  private static async decideVideoTrack(engine: SongloftAudioEngine): Promise<VideoTrackState> {
    const deadline = Date.now() + SongloftVideoModule.OPEN_TIMEOUT_MS
    while (true) {
      const state = engine.videoTrackState()
      if (state !== VideoTrackState.LOADING) return state
      if (Date.now() >= deadline) return VideoTrackState.FAILED
      await new Promise<void>((resolve) => setTimeout(resolve, 100))
    }
  }

  private static emitVideoSize(width: number, height: number): void {
    const ctx = SongloftVideoModule.latestContext
    if (!ctx) return
    const payload: Record<string, Object> = { 'width': width, 'height': height }
    ctx.sendGlobalEvent(SongloftVideoModule.EVENT_VIDEO_SIZE_CHANGED, [payload])
  }

  // MARK: - setSurfaceLayout / setOrientation / getVideoSize

  /**
   * Position and size the surface. The JS page passes the rect in CSS-logical
   * pixels — vp-equivalent on Harmony at 1× density. This is the single
   * control point that stops a landscape frame from being stretched onto a
   * portrait window: the rect writes through `SongloftVideoState.shared`,
   * which Index.ets's XComponent binds against.
   */
  public setSurfaceLayout(x: number, y: number, w: number, h: number): void {
    const shared = SongloftVideoState.shared
    shared.rectX = x
    shared.rectY = y
    shared.rectWidth = Math.max(1, w)
    shared.rectHeight = Math.max(1, h)
  }

  /**
   * Request an orientation lock for the host window. `'auto'` releases the
   * lock and returns to the system default (`close` implicitly does this too).
   *
   * Goes through `window.setPreferredOrientation` — the same knob any
   * HarmonyOS app uses to fix an activity to landscape / portrait. The window
   * reports its new size back through `EntryAbility.onWindowSizeChange`, which
   * then routes to [emitOrientation].
   */
  public async setOrientation(mode: string): Promise<void> {
    const w = SongloftVideoModule.hostWindow
    if (!w) return
    let orientation: window.Orientation
    switch (mode) {
      case 'portrait':
        orientation = window.Orientation.PORTRAIT
        break
      case 'landscape':
        orientation = window.Orientation.LANDSCAPE
        break
      default:
        orientation = window.Orientation.UNSPECIFIED
    }
    await w.setPreferredOrientation(orientation)
  }

  private static async releaseOrientationLock(): Promise<void> {
    const w = SongloftVideoModule.hostWindow
    if (!w) return
    await w.setPreferredOrientation(window.Orientation.UNSPECIFIED)
  }

  /**
   * Pull the decoded video's pixel dimensions if any. Pages usually listen to
   * `videoSizeChanged`; this is a fallback for pages that come up *after* the
   * first frame decoded.
   */
  public async getVideoSize(): Promise<Record<string, Object>> {
    const engine = await SongloftAudioEngine.getInstance()
    const size = engine.currentVideoSize()
    if (!size) return {}
    const inner: Record<string, Object> = { 'width': size[0], 'height': size[1] }
    return { 'result': inner }
  }
}
