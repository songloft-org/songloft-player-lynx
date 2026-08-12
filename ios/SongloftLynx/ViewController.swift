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
 */
class ViewController: UIViewController {
  /// Asset base name. `SongloftTemplateProvider` appends the `.bundle`
  /// extension, so this resolves to `main.lynx.bundle` in app resources —
  /// the same file name the Android host reads out of `assets/`.
  private static let bundleURL = "main.lynx"

  private var lynxView: LynxView?
  /// Viewport the engine was last laid out for; used to skip no-op updates.
  private var laidOutSize: CGSize = .zero

  override func viewDidLoad() {
    super.viewDidLoad()
    // Painted in the safe-area margins and during the launch frame, before the
    // bundle renders. `.systemBackground` follows the system light/dark setting,
    // which is what the Android host gets from splitting `themes.xml` by the
    // `night` resource qualifier (no flash of the wrong colour at launch).
    view.backgroundColor = .systemBackground
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
      builder.config = LynxConfig(provider: SongloftTemplateProvider())
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

    lynxView.loadTemplate(fromURL: Self.bundleURL, initData: nil)
  }
}
