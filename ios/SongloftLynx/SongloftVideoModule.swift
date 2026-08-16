import AVKit
import UIKit

/**
 * Fullscreen native video playback for the song the audio engine already holds.
 * Exposed to JS as `NativeModules.SongloftVideo`.
 *
 * The iOS counterpart of `org.songloft.lynx.video.SongloftVideoModule` (Android).
 * No URL is taken — the picture comes from the stream the audio engine is already
 * playing, so this module only lends the running AVPlayer a fullscreen surface.
 */
final class SongloftVideoModule: NSObject, LynxModule {
  @objc required init(param: Any) {}
  override init() { super.init() }

  @objc static var name: String { "SongloftVideo" }

  @objc static var methodLookup: [String: String] {
    [
      "open": NSStringFromSelector(#selector(SongloftVideoModule.open(_:callback:))),
      "close": NSStringFromSelector(#selector(SongloftVideoModule.close(_:callback:))),
      "isOpen": NSStringFromSelector(#selector(SongloftVideoModule.isOpen(_:callback:))),
    ]
  }

  static let eventClosed = "SongloftVideo.closed"

  private static var presentedVC: AVPlayerViewController?

  @objc func open(_ args: String, callback: @escaping (String) -> Void) {
    DispatchQueue.main.async {
      let engine = SongloftAudioEngine.shared
      guard engine.hasVideoTrack() else {
        callback("{\"result\":false}")
        return
      }

      let vc = AVPlayerViewController()
      vc.updatesNowPlayingInfoCenter = false
      vc.videoGravity = .resizeAspect

      engine.attachVideoOutput { player in
        vc.player = player
      }

      guard let presenter = Self.topViewController() else {
        callback("{\"result\":false}")
        return
      }

      Self.presentedVC = vc
      presenter.present(vc, animated: true) {
        callback("{\"result\":true}")
      }
    }
  }

  @objc func close(_ args: String, callback: @escaping (String) -> Void) {
    DispatchQueue.main.async {
      guard let vc = Self.presentedVC else {
        callback("{}")
        return
      }
      vc.player = nil
      SongloftAudioEngine.shared.detachVideoOutput()
      Self.presentedVC = nil
      vc.dismiss(animated: true) {
        SongloftAudioEngine.shared.sink?(Self.eventClosed, [:])
        callback("{}")
      }
    }
  }

  @objc func isOpen(_ args: String, callback: @escaping (String) -> Void) {
    DispatchQueue.main.async {
      let open = Self.presentedVC != nil
      callback("{\"result\":\(open)}")
    }
  }

  private static func topViewController() -> UIViewController? {
    guard let scene = UIApplication.shared.connectedScenes
      .compactMap({ $0 as? UIWindowScene }).first,
      let root = scene.windows.first(where: { $0.isKeyWindow })?.rootViewController
    else { return nil }
    var top = root
    while let presented = top.presentedViewController { top = presented }
    return top
  }
}
