import AVFoundation
import Foundation

/**
 * Process-wide "allow insecure TLS" switch, the iOS counterpart of
 * `org.songloft.lynx.net.InsecureTls`. Driven by the user's server setting
 * (`appConfig.insecureTls` → `SongloftPlatform.setInsecureTls`) so that a
 * Songloft behind a self-signed certificate is reachable at all.
 *
 * **Why this cannot be done in Info.plist.** The host already sets
 * `NSAppTransportSecurity.NSAllowsArbitraryLoads`, and it is easy to assume that
 * covers this — it does not. ATS governs *cleartext* HTTP; a self-signed HTTPS
 * certificate still fails the system trust evaluation. The only lever is a
 * `URLSessionDelegate` answering the server-trust challenge, which means every
 * outbound path needs a session we own. Hence [session] and [handle].
 *
 * The three outbound paths, mirroring Android:
 *
 *  1. **JS `fetch`** — [SongloftHttpService], which replaces the SDK's
 *     `LynxHttpService` precisely because that one uses `URLSession.shared`
 *     (line-for-line: `NSURLSession *session = [NSURLSession sharedSession]`)
 *     and `sharedSession` cannot take a delegate.
 *  2. **AVPlayer media streaming** — [attachIfNeeded], see the caveat there.
 *  3. **This app's own requests** — the platform module's upload, the DLNA SOAP
 *     control calls, and lock-screen artwork, all switched from
 *     `URLSession.shared` to [session].
 *
 * ⚠️ Relaxing trust is reversible here, unlike the old Android implementation
 * which ignored `enabled == false`: [handle] re-reads [enabled] on every
 * challenge, so turning the switch off tightens the *next* connection with no
 * session teardown needed.
 */
final class InsecureTls: NSObject {
  static let shared = InsecureTls()

  /// Guards [_enabled]: written from the Lynx BTS thread (`setInsecureTls`) and
  /// read on `URLSession` delegate queues.
  private let lock = NSLock()
  private var _enabled = false

  var enabled: Bool {
    lock.lock()
    defer { lock.unlock() }
    return _enabled
  }

  func update(_ value: Bool) {
    lock.lock()
    _enabled = value
    lock.unlock()
  }

  /**
   * Shared session for one-shot requests. `delegateQueue: nil` gives it a serial
   * background queue, matching `URLSession.shared`'s threading so callers that
   * were ported off `shared` need no other change.
   *
   * The session retains its delegate (`self`) and `self` is a singleton, so the
   * apparent cycle never leaks.
   */
  lazy var session: URLSession = URLSession(
    configuration: .default,
    delegate: self,
    delegateQueue: nil
  )

  /**
   * The trust policy, factored out so *any* delegate can apply it in one line —
   * notably [SongloftHttpService]'s per-request streaming receiver, which must be
   * its own delegate and so cannot use [session].
   *
   * Only `serverTrust` challenges are answered; anything else (HTTP auth,
   * client certificates) falls through to the system. When the switch is off
   * this returns `.performDefaultHandling`, i.e. exactly stock behaviour.
   */
  func handle(
    _ challenge: URLAuthenticationChallenge
  ) -> (URLSession.AuthChallengeDisposition, URLCredential?) {
    guard enabled,
          challenge.protectionSpace.authenticationMethod == NSURLAuthenticationMethodServerTrust,
          let trust = challenge.protectionSpace.serverTrust
    else {
      return (.performDefaultHandling, nil)
    }
    return (.useCredential, URLCredential(trust: trust))
  }

  /**
   * Attach ourselves as the asset's resource-loader delegate so a self-signed
   * media stream can play.
   *
   * ⚠️ **This may not fire.** `AVAssetResourceLoaderDelegate`'s
   * `shouldWaitForResponseTo:` is documented for authentication challenges, but
   * Apple never guaranteed delivery for plain `http(s)` assets — historically it
   * arrives on some OS versions and not others. It is attached because it costs
   * ~15 lines and fixes the case when it does work.
   *
   * The guaranteed-but-expensive alternative is a custom URL scheme
   * (`songloft-https://`) whose loading we service ourselves through [session],
   * which means reimplementing byte-range streaming *and* rewriting the URLs
   * inside HLS playlists. Not done — tracked in `docs/tracking/bug.md`. Verify on
   * a real device: if playback fails against a self-signed server while login
   * works, this callback is not firing and that TODO is the fix.
   */
  func attachIfNeeded(to asset: AVURLAsset) {
    guard enabled else { return }
    asset.resourceLoader.setDelegate(self, queue: .main)
  }
}

extension InsecureTls: URLSessionDelegate {
  func urlSession(
    _ session: URLSession,
    didReceive challenge: URLAuthenticationChallenge,
    completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void
  ) {
    let (disposition, credential) = handle(challenge)
    completionHandler(disposition, credential)
  }
}

extension InsecureTls: AVAssetResourceLoaderDelegate {
  func resourceLoader(
    _ resourceLoader: AVAssetResourceLoader,
    shouldWaitForResponseTo authenticationChallenge: URLAuthenticationChallenge
  ) -> Bool {
    guard enabled,
          authenticationChallenge.protectionSpace.authenticationMethod
            == NSURLAuthenticationMethodServerTrust,
          let trust = authenticationChallenge.protectionSpace.serverTrust
    else {
      return false
    }
    authenticationChallenge.sender?.use(
      URLCredential(trust: trust),
      for: authenticationChallenge
    )
    return true
  }
}
