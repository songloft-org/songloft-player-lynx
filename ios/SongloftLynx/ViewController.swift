import UIKit

/**
 * Single host view controller: builds one `LynxView`, points it at the
 * `SongloftTemplateProvider` (reads the bundle embedded in app resources) and
 * renders `main.lynx.bundle`. No dev server, no LynxExplorer — fully offline,
 * exactly like the Android host's `MainActivity`.
 *
 * Structure (builder block, `preferredLayout*` + `.exact` layout modes,
 * `loadTemplate(fromURL:)`) is copied from the official
 * `integrating-lynx-demo-projects` ios/HelloLynxSwift demo, with two deliberate
 * deviations:
 *
 *  1. **The LynxView fills the whole screen** (`view.bounds`), status bar and
 *     home indicator included, and the *page* keeps its content clear of them
 *     through `--safe-top` / `--safe-bottom` (see `src/shared/theme/tokens.css`;
 *     they resolve from `env(safe-area-inset-*)`, which Lynx supports for all
 *     four edges).
 *
 *     This used to be the other way around — the view was inset to
 *     `safeAreaLayoutGuide.layoutFrame`, so the engine never painted the top and
 *     bottom bands and `view.backgroundColor` showed through them. That colour
 *     is `.systemBackground`, i.e. it follows the *system* light/dark setting and
 *     knows nothing about the app's theme choice or an active theme pack, so any
 *     user whose app theme differed from the system one (or who activated a
 *     pack) got two bands that did not match the page — reported as "顶部和底部
 *     区域没覆盖到". Insetting the viewport also made every
 *     `env(safe-area-inset-*)` in the stylesheets either a no-op or a doubled
 *     margin, which is not what any of those rules were written for: they all
 *     assume a full-screen viewport, as `FullPlayerPage.css` and the bottom bar's
 *     `bottom:` offset show.
 *  2. **Everything happens in `viewDidLayoutSubviews`, not `viewDidLoad`**,
 *     because that is the first point where `view.bounds` is the real window
 *     size — building earlier would render the launch frame at the wrong height
 *     and immediately re-lay it out.
 *
 * It also owns the two host→page channels the app needs beyond rendering:
 * the native modules (registered on the `LynxConfig`, where Android registers
 * them process-wide on `LynxEnv`) and the system appearance (see
 * [pushAppearance]).
 */
class ViewController: UIViewController {
  /// Asset base name. `SongloftTemplateProvider` appends the `.bundle`
  /// extension, so this resolves to `main.lynx.bundle` in app resources —
  /// the same file name the Android host reads out of `assets/`.
  private static let bundleURL = "main.lynx"

  private var lynxView: LynxView?
  /// Full-screen container hosting the video `AVPlayerLayer`, sits **below** the
  /// LynxView so the page paints every control above the picture — same layering
  /// as Android's `SurfaceView + setZOrderMediaOverlay(true)` under the LynxView.
  /// Hidden until [SongloftVideoModule] opens.
  private var videoHost: UIView?
  /// Viewport the engine was last laid out for; used to skip no-op updates.
  private var laidOutSize: CGSize = .zero
  /// Insets last pushed to the page; used to skip no-op updates (see [pushSafeArea]).
  private var pushedInsets: UIEdgeInsets?
  private var localeObserver: NSObjectProtocol?

  override func viewDidLoad() {
    super.viewDidLoad()
    // Only visible during the launch frame now that the LynxView covers the whole
    // screen (it used to also paint the safe-area bands — see the type comment).
    // `.systemBackground` follows the system light/dark setting, which is what the
    // Android host gets from splitting `themes.xml` by the `night` resource
    // qualifier (no flash of the wrong colour at launch).
    view.backgroundColor = .systemBackground
    observeAppearanceChanges()
  }

  deinit {
    if let localeObserver {
      NotificationCenter.default.removeObserver(localeObserver)
    }
    SongloftVideoModule.setHostView(nil)
    SongloftVideoModule.setHostController(nil)
    SongloftVideoModule.setEventEmitter(nil)
  }

  /**
   * Which orientations UIKit may rotate the scene into. Answered from the video
   * module's current lock (`portrait` / `landscape` / `auto`), so a landscape
   * tap from the video screen actually flips the window — otherwise
   * `requestGeometryUpdate` in [SongloftVideoModule.applyOrientation] would be
   * clamped back by the default `.all` answer.
   */
  override var supportedInterfaceOrientations: UIInterfaceOrientationMask {
    switch SongloftVideoModule.lockedOrientation {
    case "portrait": return .portrait
    case "landscape": return .landscape
    default: return .all
    }
  }

  /**
   * The OS just changed our size; forward the new orientation to the page as
   * `SongloftVideo.orientationChanged` — the counterpart of Android's
   * `onConfigurationChanged` push. `size` is the *new* size (this fires before
   * layout), so it can be used directly.
   */
  override func viewWillTransition(to size: CGSize,
                                   with coordinator: UIViewControllerTransitionCoordinator) {
    super.viewWillTransition(to: size, with: coordinator)
    let orientation = size.width > size.height ? "landscape" : "portrait"
    SongloftVideoModule.emitOrientation(
      orientation: orientation,
      width: Int(size.width.rounded()),
      height: Int(size.height.rounded())
    )
  }

  override func viewDidLayoutSubviews() {
    super.viewDidLayoutSubviews()
    // Full screen, NOT `safeAreaLayoutGuide.layoutFrame`: the page avoids the
    // status bar / home indicator itself (type comment, deviation 1).
    let frame = view.bounds
    guard frame.width > 0, frame.height > 0 else { return }

    // Rotation / window resize: Lynx does not observe UIKit layout, so the new
    // viewport has to be pushed in explicitly — otherwise the page keeps the
    // launch-time layout while the view stretches.
    if let lynxView {
      // The insets are checked before the size guard on purpose: they can change
      // without the bounds changing at all (the status bar growing for a call, an
      // iPad Stage Manager resize that keeps the area), and a page that missed the
      // update would keep laying out against the launch-time inset.
      pushSafeArea()
      guard frame.size != laidOutSize else { return }
      laidOutSize = frame.size
      videoHost?.frame = frame
      lynxView.frame = frame
      lynxView.updateViewport(withPreferredLayoutWidth: frame.width,
                              preferredLayoutHeight: frame.height)
      return
    }

    // Build the video host **before** the LynxView so it sits underneath —
    // Android's MainActivity orders addView(SurfaceView) before addView(lynxView)
    // for the same reason.
    let videoHost = UIView(frame: frame)
    videoHost.backgroundColor = .black
    videoHost.isHidden = true
    videoHost.isUserInteractionEnabled = false
    view.addSubview(videoHost)
    self.videoHost = videoHost
    SongloftVideoModule.setHostView(videoHost)
    SongloftVideoModule.setHostController(self)

    laidOutSize = frame.size
    // `screenSize` is the device screen metric the engine uses (rpx and friends).
    // It is the full screen, which is now also what the layout viewport is — the
    // two only diverged while the view was inset.
    let screenSize = view.window?.windowScene?.screen.bounds.size ?? view.bounds.size
    let lynxView = LynxView { builder in
      builder.config = Self.buildConfig()
      builder.screenSize = screenSize
      builder.fontScale = 1.0
    }
    lynxView.preferredLayoutWidth = frame.width
    lynxView.preferredLayoutHeight = frame.height
    lynxView.layoutWidthMode = .exact
    lynxView.layoutHeightMode = .exact
    lynxView.frame = frame
    view.addSubview(lynxView)
    self.lynxView = lynxView

    // `LynxLoadMeta` carries the globalProps *into* the load (the render applies
    // `meta.globalProps` before it resolves the URL), so the very first frame
    // already knows the system theme — no flash of the wrong one. A native-module
    // getter could not manage that: it would be async and answer after the launch
    // frame had painted. This is also why the load stayed here rather than moving
    // earlier: the props must be set before `loadTemplate`, and `loadTemplate`
    // must wait for a resolved `view.bounds`.
    // The safe-area insets ride the same load for the same reason: the page turns
    // them into the `--safe-*` tokens every screen pads with, so a value that
    // arrived after the first frame would paint one frame under the status bar.
    // `view.safeAreaInsets` is resolved by now — this runs in
    // `viewDidLayoutSubviews`.
    var props = SystemAppearance.snapshot(traits: traitCollection)
    let insets = view.safeAreaInsets
    props.merge(SafeAreaInsets.snapshot(insets: insets)) { current, _ in current }
    pushedInsets = insets

    let meta = LynxLoadMeta()
    meta.url = Self.bundleURL
    meta.globalProps = LynxTemplateData(dictionary: props)
    lynxView.loadTemplate(meta)
  }

  /**
   * Push the current safe-area insets into a *running* page.
   *
   * Both channels, same rule as [pushAppearance]: `updateGlobalProps` so a later
   * first read is correct, and a global event so the live page reacts now.
   * `globalProps` updates alone do not reach an already-rendered tree.
   *
   * Skipped when nothing moved — this is called from `viewDidLayoutSubviews`,
   * which fires far more often than the insets change, and each call crosses into
   * the JS realm and re-renders the theme root.
   */
  private func pushSafeArea() {
    guard let lynxView else { return }
    let insets = view.safeAreaInsets
    guard insets != pushedInsets else { return }
    pushedInsets = insets
    let payload = SafeAreaInsets.snapshot(insets: insets)
    lynxView.updateGlobalProps(with: payload)
    lynxView.sendGlobalEvent(SafeAreaInsets.eventChanged, withParams: [payload])
  }

  /**
   * Rotation and status-bar height changes land here rather than in
   * `viewDidLayoutSubviews` on some paths, and this is the callback UIKit
   * documents for the purpose. Both call [pushSafeArea], which is idempotent.
   */
  override func viewSafeAreaInsetsDidChange() {
    super.viewSafeAreaInsetsDidChange()
    pushSafeArea()
  }

  /**
   * The `LynxConfig` for our single LynxView: the template provider plus the two
   * native modules. Registration must happen before the bundle loads, since the
   * TS facades probe `NativeModules.*` during startup and permanently fall back
   * to the mock audio / in-memory storage if a module is missing.
   *
   * Unlike the host services and XElement behaviors (which self-register through
   * the pods' lazy-register mechanism — see `AppDelegate`), app-owned modules
   * have to be registered by hand, and the `methodLookup` tables inside them are
   * the only description of their JS surface.
   */
  private static func buildConfig() -> LynxConfig {
    let config = LynxConfig(provider: SongloftTemplateProvider())
    config.register(SongloftAudioModule.self)
    config.register(SongloftStorageModule.self)
    config.register(SongloftPlatformModule.self)
    config.register(SongloftDlnaModule.self)
    #if DEBUG
    config.register(SongloftTestBridgeModule.self)
    #endif
    config.register(SongloftVideoModule.self)
    config.register(SongloftSongCacheModule.self)
    config.register(SongloftPluginBridgeModule.self)
    // LiveActivityModule is @available(iOS 16.2, *) (ActivityKit floor) while the
    // deployment target stays 16.0, so the registration itself needs the guard —
    // referencing the class outside it is a hard compile error, not a runtime one.
    if #available(iOS 16.2, *) {
      config.register(LiveActivityModule.self)
    }
    return config
  }

  // MARK: - System appearance

  /**
   * Dark-mode and language changes reach a *running* page only if the host pushes
   * them: Lynx notifies nothing on its own, and `globalProps` updates do not
   * reach an already-rendered page. So both channels are written on every change
   * — `updateGlobalProps` so any later first read is correct, and a global event
   * so the live page reacts now (`src/native/system-appearance.ts`).
   *
   * The two sources are deliberately different mechanisms:
   *  - **theme** → trait changes. `registerForTraitChanges` is the iOS 17+ API;
   *    `traitCollectionDidChange` is its (deprecated, but still delivered)
   *    predecessor, kept for the 16.x floor this target supports.
   *  - **locale** → `NSLocale.currentLocaleDidChange`. Changing the *app's*
   *    language in Settings relaunches the process (so the `globalProps` initial
   *    value covers it); this notification catches the region/system-language
   *    edits that do not.
   */
  private func observeAppearanceChanges() {
    if #available(iOS 17.0, *) {
      registerForTraitChanges([UITraitUserInterfaceStyle.self]) {
        (self: Self, _: UITraitCollection) in
        self.pushAppearance()
      }
    }
    localeObserver = NotificationCenter.default.addObserver(
      forName: NSLocale.currentLocaleDidChangeNotification,
      object: nil,
      queue: .main
    ) { [weak self] _ in
      self?.pushAppearance()
    }
  }

  override func traitCollectionDidChange(_ previousTraitCollection: UITraitCollection?) {
    super.traitCollectionDidChange(previousTraitCollection)
    // On iOS 17+ `registerForTraitChanges` already delivers this.
    if #available(iOS 17.0, *) { return }
    guard traitCollection.hasDifferentColorAppearance(comparedTo: previousTraitCollection) else {
      return
    }
    pushAppearance()
  }

  private func pushAppearance() {
    guard let lynxView else { return }
    let appearance = SystemAppearance.snapshot(traits: traitCollection)
    lynxView.updateGlobalProps(with: appearance)
    lynxView.sendGlobalEvent(SystemAppearance.eventChanged, withParams: [appearance])
  }
}
