import UIKit

/**
 * App entry: brings the Lynx runtime up once, before any `LynxView` exists.
 *
 * This is the iOS counterpart of `SongloftApplication.onCreate()` on Android.
 * Most host services are **not** registered by hand: each pod self-registers
 * through Lynx's lazy-register mechanism (`LYNX_LAZY_LOAD` / `LynxLazyRegister`),
 * which CocoaPods wires up by linking the static libs with `-ObjC`. Touching
 * `LynxEnv.sharedInstance()` is what flushes those pending registrations — so it
 * must happen before the first LynxView is built. Which of those services exist
 * is decided purely by the `Podfile` (Image / Log / Devtool).
 *
 * **The HTTP service is the one exception** (batch 45). `LynxService/Http` is
 * removed from the Podfile and [SongloftHttpService] is registered here instead,
 * because the SDK implementation drives its requests through
 * `URLSession.shared`, which cannot take a delegate — leaving no way to accept a
 * self-signed certificate, which is what the user's "allow insecure TLS" setting
 * is supposed to do. Replacing rather than overriding keeps it deterministic:
 * nothing documents whether a late `registerServiceWithProtocol:` beats the
 * pod's `@LynxServiceRegister`, so we make sure there is no competitor.
 */
@main
class AppDelegate: UIResponder, UIApplicationDelegate {
  var window: UIWindow?

  #if DEBUG
  private let testBridgeServer = TestBridgeServer()
  #endif

  func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    LynxEnv.sharedInstance()
    SongloftTabGlassUI.registerComponent()
    registerHttpService()
    #if DEBUG
    testBridgeServer.start()
    #endif
    return true
  }

  /**
   * Bind [SongloftHttpService] to `LynxServiceHttpProtocol`.
   *
   * Runs *after* `LynxEnv.sharedInstance()` so it lands after the lazy-register
   * flush. The protocol object has to be looked up by name because `@protocol()`
   * is a C construct with no Swift equivalent; the ObjC entry point is
   * `+[LynxServices registerServiceWithProtocol:protocol:]`. Mind the Swift
   * import names, which the importer reshapes unevenly: registration becomes
   * `registerService(withProtocol:protocol:)`, but the lookup keeps its base
   * word and drops the type-repeating one — `getInstanceWith(_:)`, not
   * `getInstance(with:)` nor `instance(withProtocol:)`.
   */
  private func registerHttpService() {
    guard let httpProtocol = NSProtocolFromString("LynxServiceHttpProtocol") else {
      assertionFailure("LynxServiceHttpProtocol missing — fetch will not work")
      return
    }
    LynxServices.registerService(withProtocol: SongloftHttpService.self, protocol: httpProtocol)
    assert(
      LynxServices.getInstanceWith(httpProtocol) is SongloftHttpService,
      "host HTTP service is not ours — check the Podfile still excludes LynxService/Http"
    )
  }
}
