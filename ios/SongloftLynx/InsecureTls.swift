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
 *  2. **AVPlayer media streaming** — [InsecureMediaLoader], which loads the bytes
 *     itself over [session]. Answering AVFoundation's own trust challenge is not an
 *     option: this class used to implement
 *     `AVAssetResourceLoaderDelegate.shouldWaitForResponseTo:` for that, and it was
 *     measured on iOS 18.3 to never be called for a plain `https` asset (login worked,
 *     playback failed with "The certificate for this server is invalid."), so that
 *     code is gone rather than left as a decoy.
 *  3. **This app's own requests** — the platform module's upload, the DLNA SOAP
 *     control calls, and lock-screen artwork, all switched from
 *     `URLSession.shared` to [session].
 *
 * Relaxing trust is reversible, unlike the old Android implementation which ignored
 * `enabled == false`: [handle] re-reads [enabled] on every challenge. That alone was
 * not enough to make "off" take effect immediately, though — see [update] for the
 * connection-pool half of it.
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

  /**
   * Flip the switch, dropping [session] (and therefore its connection pool) when the
   * value actually changes.
   *
   * **Why the pool has to go.** TLS is negotiated per *connection*, and `URLSession`
   * keeps connections alive for reuse. A request that reuses a connection which
   * handshook while the switch was on never issues another server-trust challenge, so
   * [handle] — correct as it is — is simply never consulted, and the tightened
   * setting appears to be ignored until the connection happens to go idle. Measured:
   * with the switch off again but the same `https://127.0.0.1:58543` URL, login kept
   * succeeding against a self-signed server; only pointing at another hostname for
   * the same server (a different pool entry, so a fresh handshake) failed as it
   * should. Discarding the session is what makes "off" mean off *now*.
   *
   * `invalidateAndCancel` also kills requests in flight. That is deliberate: the
   * whole point of switching off mid-session is to stop talking to a server we no
   * longer trust, so finishing those requests would defeat it.
   *
   * The no-change guard matters — `applyInsecureTls` runs on every login and on every
   * server-settings write, and nuking the connection pool on each of those would be a
   * needless round of handshakes.
   */
  func update(_ value: Bool) {
    lock.lock()
    guard _enabled != value else {
      lock.unlock()
      return
    }
    _enabled = value
    let stale = _session
    _session = nil
    lock.unlock()
    stale?.invalidateAndCancel()
  }

  private var _session: URLSession?

  /**
   * Shared session for one-shot requests. `delegateQueue: nil` gives it a serial
   * background queue, matching `URLSession.shared`'s threading so callers that
   * were ported off `shared` need no other change.
   *
   * Created on demand rather than stored once, because [update] throws the old one
   * away; a `lazy var` could not be reset. The session retains its delegate (`self`)
   * and `self` is a singleton, so the apparent cycle never leaks.
   */
  var session: URLSession {
    lock.lock()
    defer { lock.unlock() }
    if let _session { return _session }
    let created = URLSession(configuration: .default, delegate: self, delegateQueue: nil)
    _session = created
    return created
  }

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

