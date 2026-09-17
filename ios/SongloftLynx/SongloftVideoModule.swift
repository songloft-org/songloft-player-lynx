import AVFoundation
import UIKit

/**
 * Fullscreen native video playback for the song the audio engine already holds.
 * Exposed to JS as `NativeModules.SongloftVideo`.
 *
 * The iOS counterpart of `org.songloft.lynx.video.SongloftVideoModule` (Android).
 * No URL is taken — the picture comes from the stream the audio engine is already
 * playing, so this module only lends the running AVPlayer a surface.
 *
 * Design mirrors Android's SurfaceView-under-LynxView pattern: the host builds one
 * `UIView` that fills the window and lives *below* the LynxView (see
 * [ViewController]), and hosts an `AVPlayerLayer` on it. `open()` shows the layer
 * and attaches the engine's video output; `close()` hides it and detaches. The
 * JS page paints every control above the picture, so styling stays identical on
 * every platform — no modal chrome to fight.
 *
 * ## Sizing
 *
 * The picture is *not* stretched to fill the surface: the JS page reads the
 * video's pixel dimensions from the `videoSizeChanged` event and calls
 * [setSurfaceLayout] with a letterbox / zoom rect. The rect arrives in
 * CSS-logical pixels (the same unit `boundingClientRect` returns in Lynx),
 * which are point-equivalent on iOS — no density scaling is needed here (a
 * point *is* the layout unit UIKit uses), unlike Android where the rect is
 * scaled by `DisplayMetrics.density`.
 */
final class SongloftVideoModule: NSObject, LynxContextModule {
  @objc static var name: String { "SongloftVideo" }

  /**
   * Byte-for-byte match with `src/native/video.ts`. iOS, like Android, does not
   * push a `closed` event today: the framework back button routes to
   * `performRouteBack` on its own, so a separate close-from-host channel would
   * be a second source of truth for the same signal.
   */
  static let eventVideoSizeChanged = "SongloftVideo.videoSizeChanged"
  static let eventOrientationChanged = "SongloftVideo.orientationChanged"

  @objc static var methodLookup: [String: String] {
    [
      "open": NSStringFromSelector(#selector(SongloftVideoModule.open(_:callback:))),
      "close": NSStringFromSelector(#selector(SongloftVideoModule.close(_:callback:))),
      "isOpen": NSStringFromSelector(#selector(SongloftVideoModule.isOpen(_:callback:))),
      "setSurfaceLayout":
        NSStringFromSelector(#selector(SongloftVideoModule.setSurfaceLayout(_:callback:))),
      "setOrientation":
        NSStringFromSelector(#selector(SongloftVideoModule.setOrientation(_:callback:))),
      "getVideoSize":
        NSStringFromSelector(#selector(SongloftVideoModule.getVideoSize(_:callback:))),
    ]
  }

  private weak var context: LynxContext?

  // MARK: - Host wiring
  //
  // The container UIView (below the LynxView) and its owning UIViewController
  // are pushed in by [ViewController] on viewDidLayoutSubviews, matching how
  // Android's MainActivity pushes the SurfaceView. They stay static because
  // `LynxContextModule` instances are per-LynxView and short-lived: a fresh
  // module can pick up an already-registered host.

  private static var host: UIView?
  private static var playerLayer: AVPlayerLayer?
  private static weak var hostController: UIViewController?
  private static var eventEmitter: ((String, [String: Any]) -> Void)?
  private static var isOpen = false

  static func setHostView(_ view: UIView?) {
    host = view
    if view == nil {
      playerLayer?.removeFromSuperlayer()
      playerLayer = nil
    }
  }

  static func setHostController(_ controller: UIViewController?) {
    hostController = controller
  }

  static func setEventEmitter(_ emitter: ((String, [String: Any]) -> Void)?) {
    eventEmitter = emitter
  }

  /// Push the orientation the OS just switched into. Called by [ViewController]
  /// from `viewWillTransition`, matching Android's `onConfigurationChanged`.
  static func emitOrientation(orientation: String, width: Int, height: Int) {
    eventEmitter?(
      eventOrientationChanged,
      [
        "orientation": orientation,
        "width": Double(width),
        "height": Double(height),
      ]
    )
  }

  private init(context: LynxContext?) {
    self.context = context
    super.init()
    // The event emitter forwards through *this* module's context so events
    // reach the currently-loaded page (a reloaded page cannot be fed by a
    // stale context — same rule as `SongloftAudioModule`).
    Self.eventEmitter = { [weak self] event, payload in
      self?.context?.sendGlobalEvent(event, withParams: [payload])
    }
  }

  @objc(initWithLynxContext:)
  convenience init(lynxContext context: LynxContext) {
    self.init(context: context)
  }

  @objc(initWithLynxContext:WithParam:)
  convenience init(lynxContext context: LynxContext, withParam param: Any) {
    self.init(context: context)
  }

  @objc(initWithParam:)
  convenience init(param: Any) {
    self.init(context: nil)
  }

  override convenience init() {
    self.init(context: nil)
  }

  // MARK: - open / close / isOpen

  @objc func open(_ args: String, callback: @escaping (String) -> Void) {
    DispatchQueue.main.async { Self.openIfPossible(callback: callback) }
  }

  private static func openIfPossible(callback: @escaping (String) -> Void) {
    /*
     * One surface at a time, and this check comes first: with one already up the
     * honest answer is "the picture is on screen", whatever the stream that was
     * just loaded carries.
     */
    if isOpen {
      callback(#"{"result":"opened"}"#)
      return
    }

    decideVideoTrack(deadline: Date().addingTimeInterval(8)) { state in
      switch state {
      case .hasTrack:
        present(callback: callback)
      case .noTrack:
        callback(#"{"result":"noTrack"}"#)
      case .failed, .loading:
        // `.loading` after the deadline is itself a failure.
        callback(#"{"result":"failed"}"#)
      }
    }
  }

  /**
   * Wait until the item's fate is known before answering `open`.
   *
   * The item can still be preparing when `open` arrives, in which case
   * `hasVideoTrack()` would read like "no track" — the exact misreport this
   * contract exists to kill.
   */
  private static func decideVideoTrack(
    deadline: Date,
    completion: @escaping (SongloftAudioEngine.VideoTrackState) -> Void
  ) {
    let state = SongloftAudioEngine.shared.videoTrackState()
    if state != .loading {
      completion(state)
      return
    }
    if Date() >= deadline {
      completion(.failed)
      return
    }
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
      decideVideoTrack(deadline: deadline, completion: completion)
    }
  }

  private static func present(callback: @escaping (String) -> Void) {
    guard let host else {
      callback(#"{"result":"failed"}"#)
      return
    }

    // (Re)build the layer so a repeat open cannot inherit a torn-down player.
    playerLayer?.removeFromSuperlayer()
    let layer = AVPlayerLayer()
    // `.resizeAspect` would letterbox at layer level, but every dimension of the
    // sizing behavior is decided by the JS page via `setSurfaceLayout` — the
    // layer just fills the rect it is given, so `.resize` (stretch to layer
    // frame) is correct here. This is the same choice Android's SurfaceView
    // makes: the LayoutParams *are* the aspect.
    layer.videoGravity = .resize
    layer.frame = host.bounds
    host.layer.addSublayer(layer)
    playerLayer = layer
    host.isHidden = false

    SongloftAudioEngine.shared.attachVideoOutput(
      { player in
        layer.player = player
      },
      onVideoSize: { width, height in
        eventEmitter?(
          eventVideoSizeChanged,
          ["width": Double(width), "height": Double(height)]
        )
      }
    )
    isOpen = true
    callback(#"{"result":"opened"}"#)
  }

  @objc func close(_ args: String, callback: @escaping (String) -> Void) {
    DispatchQueue.main.async {
      Self.teardown()
      Self.releaseOrientationLock()
      callback("{}")
    }
  }

  /**
   * Give the surface back: drop the layer's hold on the player and hide the host
   * view. Every path that ends the presentation funnels through here.
   *
   * Audio deliberately keeps playing — the user closed the *picture*, not the
   * song, and the stream is one and the same.
   */
  private static func teardown() {
    guard isOpen else { return }
    playerLayer?.player = nil
    playerLayer?.removeFromSuperlayer()
    playerLayer = nil
    host?.isHidden = true
    SongloftAudioEngine.shared.detachVideoOutput()
    isOpen = false
  }

  @objc func isOpen(_ args: String, callback: @escaping (String) -> Void) {
    DispatchQueue.main.async {
      callback("{\"result\":\(Self.isOpen)}")
    }
  }

  // MARK: - setSurfaceLayout / setOrientation / getVideoSize

  /**
   * Position and size the underlay layer inside its host. The JS page passes the
   * rect in CSS-logical pixels — point-equivalent on iOS (unlike Android, which
   * needs `DisplayMetrics.density` scaling). It is the single control point that
   * stops a landscape frame from being stretched onto a portrait window.
   */
  @objc func setSurfaceLayout(_ args: String, callback: @escaping (String) -> Void) {
    let rect = Self.parseRect(args)
    DispatchQueue.main.async {
      if let layer = Self.playerLayer {
        // Disable the implicit animation the layer would otherwise run on a
        // frame change (visible as a scale-in on every layout push).
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        layer.frame = rect
        CATransaction.commit()
      }
      callback("{}")
    }
  }

  private static func parseRect(_ json: String) -> CGRect {
    guard let data = json.data(using: .utf8),
          let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
    else { return .zero }
    let x = (obj["x"] as? NSNumber)?.doubleValue ?? 0
    let y = (obj["y"] as? NSNumber)?.doubleValue ?? 0
    let w = (obj["width"] as? NSNumber)?.doubleValue ?? 0
    let h = (obj["height"] as? NSNumber)?.doubleValue ?? 0
    return CGRect(x: x, y: y, width: max(1, w), height: max(1, h))
  }

  /**
   * Request an orientation lock for the host window. `'auto'` releases the lock
   * and returns to the system default (`close` implicitly does this too).
   *
   * iOS 16 introduced `requestGeometryUpdate` for programmatic rotation and
   * deprecated the pre-16 device-orientation trick that flipped the status bar
   * out from under UIKit's expectations; that is the API path here.
   * `preferredInterfaceOrientationForPresentation` cannot rotate a live scene —
   * only lock a future presentation — so this call also has to nudge the scene
   * into recomputing the supported set.
   */
  @objc func setOrientation(_ args: String, callback: @escaping (String) -> Void) {
    let mode = Self.parseOrientationMode(args)
    DispatchQueue.main.async {
      Self.applyOrientation(mode: mode)
      callback("{}")
    }
  }

  private static func parseOrientationMode(_ json: String) -> String {
    guard let data = json.data(using: .utf8),
          let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
          let mode = obj["mode"] as? String
    else { return "auto" }
    return mode
  }

  /// Which orientations the scene may currently rotate to. Read by
  /// [SongloftSceneDelegate.window(_:didUpdateFocusIn:)] via the ViewController
  /// override that reports supported orientations.
  static var lockedOrientation: String = "auto"

  private static func applyOrientation(mode: String) {
    lockedOrientation = mode
    guard let scene = UIApplication.shared.connectedScenes
      .compactMap({ $0 as? UIWindowScene }).first
    else { return }
    if #available(iOS 16.0, *) {
      let mask: UIInterfaceOrientationMask
      switch mode {
      case "portrait": mask = .portrait
      case "landscape": mask = .landscape
      default: mask = .all
      }
      scene.requestGeometryUpdate(.iOS(interfaceOrientations: mask)) { _ in }
      // The scene also needs its supported-orientations answer to change, or a
      // subsequent user rotation could push it back out of the requested mask.
      hostController?.setNeedsUpdateOfSupportedInterfaceOrientations()
    }
  }

  private static func releaseOrientationLock() {
    applyOrientation(mode: "auto")
  }

  /**
   * Pull the decoded video's pixel dimensions. Pages usually listen to
   * `videoSizeChanged`; this is a fallback for pages that come up *after* the
   * first frame decoded.
   */
  @objc func getVideoSize(_ args: String, callback: @escaping (String) -> Void) {
    DispatchQueue.main.async {
      guard let size = SongloftAudioEngine.shared.currentVideoSize() else {
        callback("{}")
        return
      }
      callback(
        "{\"result\":{\"width\":\(size.width),\"height\":\(size.height)}}"
      )
    }
  }
}
