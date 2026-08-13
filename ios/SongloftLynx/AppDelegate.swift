import UIKit

/**
 * App entry: brings the Lynx runtime up once, before any `LynxView` exists.
 *
 * This is the iOS counterpart of `SongloftApplication.onCreate()` on Android,
 * with one important difference: on iOS the host services (image / log / http)
 * and the XElement behaviors are **not** registered by hand. Each pod
 * self-registers through Lynx's lazy-register mechanism (`LYNX_LAZY_LOAD` /
 * `LynxLazyRegister`), which CocoaPods wires up by linking the static libs with
 * `-ObjC`. Touching `LynxEnv.sharedInstance()` is what flushes those pending
 * registrations — so it must happen before the first LynxView is built.
 *
 * Registering nothing explicitly mirrors the official
 * `integrating-lynx-demo-projects` ios/HelloLynxSwift demo, which also only
 * calls `LynxEnv.sharedInstance()`. Which services exist is decided purely by
 * the `Podfile` (see there: Image / Log / Http, no Devtool).
 */
@main
class AppDelegate: UIResponder, UIApplicationDelegate {
  var window: UIWindow?

  private let testBridgeServer = TestBridgeServer()

  func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    LynxEnv.sharedInstance()
    testBridgeServer.start()
    return true
  }
}
