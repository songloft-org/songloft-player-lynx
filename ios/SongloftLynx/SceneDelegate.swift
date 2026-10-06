import UIKit

/**
 * Creates the single window and puts `ViewController` (one full-screen
 * `LynxView`) on screen. Built programmatically on purpose: no `Main.storyboard`
 * means no storyboard↔module-name coupling to keep in sync, and the whole host
 * is four small Swift files.
 */
class SceneDelegate: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?

  func scene(
    _ scene: UIScene,
    willConnectTo session: UISceneSession,
    options connectionOptions: UIScene.ConnectionOptions
  ) {
    guard let windowScene = scene as? UIWindowScene else { return }
    let window = UIWindow(windowScene: windowScene)
    window.rootViewController = ViewController()
    self.window = window
    window.makeKeyAndVisible()
  }

  func sceneDidBecomeActive(_ scene: UIScene) {
    (window?.rootViewController as? ViewController)?.setSceneActive(true)
  }

  func sceneWillResignActive(_ scene: UIScene) {
    (window?.rootViewController as? ViewController)?.setSceneActive(false)
  }

  func sceneDidDisconnect(_ scene: UIScene) {
    (window?.rootViewController as? ViewController)?.setSceneActive(false)
    window = nil
  }
}
