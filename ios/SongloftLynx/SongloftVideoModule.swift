import AVKit
import UIKit

/**
 * An `AVPlayerViewController` that reports its own dismissal.
 *
 * AVKit puts its own Done button in the modal playback UI, and that button dismisses
 * the controller directly — it never goes through `close()`. So the picture went away
 * while this module went on believing it was still up: `isOpen()` answered true, JS
 * skipped the next open as "already open" (a dead tap), and `closed` never fired.
 * The Done button is not the only such path — a sheet's swipe-down and any
 * system-initiated dismissal behave the same — so listening here covers them all.
 *
 * `isBeingDismissed`, not simply "the view is gone": `viewDidDisappear` also fires
 * when this controller is merely *covered* by another fullscreen presentation, and
 * then the picture is still ours to hand back.
 */
final class SongloftVideoViewController: AVPlayerViewController {
  var onDismissed: ((SongloftVideoViewController) -> Void)?

  override func viewDidDisappear(_ animated: Bool) {
    super.viewDidDisappear(animated)
    guard isBeingDismissed else { return }
    onDismissed?(self)
  }
}

/**
 * Fullscreen native video playback for the song the audio engine already holds.
 * Exposed to JS as `NativeModules.SongloftVideo`.
 *
 * The iOS counterpart of `org.songloft.lynx.video.SongloftVideoModule` (Android).
 * No URL is taken — the picture comes from the stream the audio engine is already
 * playing, so this module only lends the running AVPlayer a fullscreen surface.
 *
 * Every path that ends the presentation — `close()` from JS, the Done button, a
 * swipe-down — funnels through `teardown`, which is also the only place that clears
 * `presentedVC`. Nothing else may clear it, or the identity check below stops being
 * able to tell "already released" from "a second surface".
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

      /*
       * One surface at a time, and this check comes first: with one already up the
       * honest answer is "the picture is on screen", whatever the stream that was
       * just loaded carries. Answering the no-track case first would have JS report
       * a pictureless file while the picture was in front of the user.
       *
       * iOS keeps a single `presentedVC`, so a second `open()` would overwrite it and
       * orphan the first controller — presented from the video itself, and never
       * released. JS guards this too; the guard belongs where the state lives.
       */
      guard Self.presentedVC == nil else {
        callback("{\"result\":true}")
        return
      }

      guard engine.hasVideoTrack() else {
        callback("{\"result\":false}")
        return
      }

      let vc = SongloftVideoViewController()
      vc.updatesNowPlayingInfoCenter = false
      vc.videoGravity = .resizeAspect
      // No retain cycle: the closure captures neither the controller nor self.
      vc.onDismissed = { Self.teardown($0) }

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
      // Released before the dismissal, so the `viewDidDisappear` that follows finds
      // nothing to answer and the event fires once.
      Self.teardown(vc)
      vc.dismiss(animated: true) {
        callback("{}")
      }
    }
  }

  /**
   * Give the surface back: drop the controller's hold on the engine's player, tell
   * the engine the picture is gone, and let JS know the same way `close()` does.
   *
   * Audio deliberately keeps playing — the user closed the *picture*, not the song,
   * and the stream is one and the same. Nothing here pauses or stops the engine.
   *
   * Idempotent by identity: after the first call `presentedVC` is nil, so the
   * dismissal that follows (and any later Done press on an old controller) is a
   * no-op instead of a second event.
   */
  private static func teardown(_ vc: AVPlayerViewController) {
    guard presentedVC === vc else { return }
    vc.player = nil
    SongloftAudioEngine.shared.detachVideoOutput()
    presentedVC = nil
    SongloftAudioEngine.shared.sink?(eventClosed, [:])
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
