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
 * deviations, both about matching the Android host's geometry:
 *
 *  1. **The LynxView is inset to the safe area**, not the full screen. The pages
 *     add no top padding of their own (nothing reads a safe-area inset), and on
 *     Android they don't need to: `Theme.Material(.Light).NoActionBar` at
 *     targetSdk 34 lays the Activity out *below* the status bar. Filling the
 *     whole iOS screen instead put the Settings/Home headers under the clock and
 *     the Dynamic Island, and the tab bar under the home indicator.
 *  2. **Everything happens in `viewDidLayoutSubviews`, not `viewDidLoad`**,
 *     because that is the first point where the safe-area insets are resolved —
 *     building earlier would render the launch frame at the wrong height and
 *     immediately re-lay it out.
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
  /// Viewport the engine was last laid out for; used to skip no-op updates.
  private var laidOutSize: CGSize = .zero
  private var localeObserver: NSObjectProtocol?

  override func viewDidLoad() {
    super.viewDidLoad()
    // Painted in the safe-area margins and during the launch frame, before the
    // bundle renders. `.systemBackground` follows the system light/dark setting,
    // which is what the Android host gets from splitting `themes.xml` by the
    // `night` resource qualifier (no flash of the wrong colour at launch).
    view.backgroundColor = .systemBackground
    observeAppearanceChanges()
  }

  deinit {
    if let localeObserver {
      NotificationCenter.default.removeObserver(localeObserver)
    }
  }

  override func viewDidLayoutSubviews() {
    super.viewDidLayoutSubviews()
    let frame = view.safeAreaLayoutGuide.layoutFrame
    guard frame.width > 0, frame.height > 0 else { return }

    // Rotation / window resize: Lynx does not observe UIKit layout, so the new
    // viewport has to be pushed in explicitly — otherwise the page keeps the
    // launch-time layout while the view stretches.
    if let lynxView {
      guard frame.size != laidOutSize else { return }
      laidOutSize = frame.size
      lynxView.frame = frame
      lynxView.updateViewport(withPreferredLayoutWidth: frame.width,
                              preferredLayoutHeight: frame.height)
      return
    }

    laidOutSize = frame.size
    // `screenSize` is the device screen metric the engine uses (rpx and friends),
    // so it stays the *full* screen — only the layout viewport is inset.
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
    // must wait for the safe-area insets.
    let meta = LynxLoadMeta()
    meta.url = Self.bundleURL
    meta.globalProps = LynxTemplateData(
      dictionary: SystemAppearance.snapshot(traits: traitCollection)
    )
    lynxView.loadTemplate(meta)
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
    config.register(SongloftTestBridgeModule.self)
    config.register(LiveActivityModule.self)
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
