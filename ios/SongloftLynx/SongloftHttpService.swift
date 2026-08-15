import Foundation

/**
 * The host HTTP service backing the bare global `fetch` (AGENTS.md §3), replacing
 * the SDK's `LynxHttpService` from the `LynxService/Http` subspec.
 *
 * **Why we own this at all:** the SDK implementation's non-streaming path is
 * `NSURLSession *session = [NSURLSession sharedSession]`, and `sharedSession`
 * cannot be given a delegate — so there is no way to answer a server-trust
 * challenge on it. That is why "allow insecure TLS" never worked on iOS: the
 * `NSAllowsArbitraryLoads` entry in Info.plist only relaxes *cleartext HTTP*,
 * never certificate validation. See `InsecureTls`.
 *
 * The mapping below is deliberately a **transcription** of the SDK's
 * `LynxHttpService.m` / `LynxNSUrlSessionDelegate.m` — same 499 sentinel, same
 * `statusText = "OK"`, same `useStreaming` branch — so swapping the service
 * changes TLS behaviour and nothing else.
 *
 * ⚠️ **Registration is explicit, and the SDK subspec is removed.** The SDK class
 * self-registers via `@LynxServiceRegister` (flushed when `LynxEnv.sharedInstance()`
 * runs), and nothing documents whether a later `registerServiceWithProtocol:`
 * wins. So instead of racing it, `ios/Podfile` drops the `Http` subspec and
 * `AppDelegate` registers this class — the same "replace, don't override"
 * approach the Android host takes. Consequence: if this registration is ever
 * lost, `fetch` returns nothing at all rather than silently falling back to a
 * service that ignores the TLS setting. That is the intended failure mode — loud
 * beats quietly-wrong.
 *
 * Every method carries an explicit `@objc(selector)` — the selector is the real
 * contract. The Swift method names, by contrast, must match what the **importer**
 * makes of the ObjC protocol, and its renaming heuristics strip label words that
 * repeat the parameter type name: `invokeWithRequest:` + `LynxHttpRequest*`
 * imports as `invoke(with:)`, `withDelegate:` + `LynxHttpStreamingDelegate*` as
 * `with:`, `processChunkedData:withData:` + `NSData*` as `processChunkedData(_:with:)`.
 * Swift's protocol-conformance check goes through that imported view, so the
 * names below follow the importer, not the ObjC spelling (first compiled on
 * macOS — the Linux dev machine could not).
 */
@objc(SongloftHttpService)
final class SongloftHttpService: NSObject, LynxServiceHttpProtocol {

  /// `LynxServices.getInstanceWithProtocol:` resolves implementations through
  /// `sharedInstance`, so this is part of the contract, not a convenience.
  @objc(sharedInstance)
  static func sharedInstance() -> SongloftHttpService { shared }

  static let shared = SongloftHttpService()

  /// Mirrors the SDK's sentinel for "the request never reached the server".
  private static let failedInternallyStatusCode = 499

  private static let deprecatedStreamingFlag = "useStreaming"

  private static func nsRequest(from request: LynxHttpRequest) -> URLRequest? {
    guard let urlString = request.url, let url = URL(string: urlString) else { return nil }
    var nsRequest = URLRequest(url: url)
    nsRequest.httpMethod = request.httpMethod
    for (key, value) in request.httpHeaders ?? [:] {
      nsRequest.setValue(value, forHTTPHeaderField: key)
    }
    nsRequest.httpBody = request.httpBody
    return nsRequest
  }

  private static func failure(_ request: LynxHttpRequest, _ message: String) -> LynxHttpResponse {
    let response = LynxHttpResponse()
    response.url = request.url
    response.statusCode = failedInternallyStatusCode
    response.statusText = message
    return response
  }

  @objc(invokeWithRequest:callback:)
  func invoke(with request: LynxHttpRequest, callback: @escaping LynxHttpCallback) {
    guard let urlRequest = Self.nsRequest(from: request) else {
      callback(Self.failure(request, "invalid url"))
      return
    }
    // `InsecureTls.session`, not `URLSession.shared` — see the class comment.
    let task = InsecureTls.shared.session.dataTask(with: urlRequest) { data, response, error in
      let result = LynxHttpResponse()
      result.url = response?.url?.absoluteString
      result.httpBody = data

      if let error {
        result.statusCode = Self.failedInternallyStatusCode
        result.statusText = error.localizedDescription
      } else if let http = response as? HTTPURLResponse {
        result.statusText = "OK"
        result.httpHeaders = http.allHeaderFields
        result.statusCode = http.statusCode
      } else {
        result.statusCode = Self.failedInternallyStatusCode
        result.statusText = "no response"
      }
      callback(result)
    }
    task.resume()
  }

  @objc(invokeStreamingWithRequest:callback:withDelegate:)
  func invokeStreaming(
    with request: LynxHttpRequest,
    callback: @escaping LynxHttpCallback,
    with delegate: LynxHttpStreamingDelegate
  ) {
    guard let urlRequest = Self.nsRequest(from: request) else {
      callback(Self.failure(request, "invalid url"))
      delegate.onError("invalid url")
      delegate.onEnd()
      return
    }

    let useDeprecated =
      (request.customConfig?[Self.deprecatedStreamingFlag] as? NSNumber)?.boolValue ?? false

    // A streaming response needs a per-request delegate, so this cannot use the
    // shared session — the receiver applies the same TLS policy itself.
    let receiver = StreamingReceiver(
      delegate: delegate,
      callback: callback,
      useDeprecatedStreamingConfig: useDeprecated
    )
    let session = URLSession(
      configuration: .default,
      delegate: receiver,
      delegateQueue: Self.streamingQueue
    )
    session.dataTask(with: urlRequest).resume()
    // Lets the session release the receiver once the task finishes; without it
    // the session (and its delegate) leak for the lifetime of the process.
    session.finishTasksAndInvalidate()
  }

  /// The SDK uses one shared serial queue for all streaming delegates; matched.
  private static let streamingQueue = OperationQueue()

  /**
   * Interceptors are a Lynx extension point this app does not use. The SDK's
   * implementation also returns `NO` (i.e. "not supported"), so declining keeps
   * behaviour identical rather than silently accepting and ignoring one.
   */
  @objc(setHttpInterceptor:)
  func setHttpInterceptor(_ interceptor: LynxHttpInterceptor?) -> Bool { false }
}

/**
 * Per-request streaming receiver — a transcription of the SDK's
 * `LynxNSUrlSessionDelegate`, plus the server-trust challenge the SDK version
 * never needed (its session was created by code that had no TLS switch).
 */
private final class StreamingReceiver: NSObject, URLSessionDataDelegate {
  private let delegate: LynxHttpStreamingDelegate
  private let callback: LynxHttpCallback
  private let buffer = NSMutableData()
  private let useDeprecatedStreamingConfig: Bool

  init(
    delegate: LynxHttpStreamingDelegate,
    callback: @escaping LynxHttpCallback,
    useDeprecatedStreamingConfig: Bool
  ) {
    self.delegate = delegate
    self.callback = callback
    self.useDeprecatedStreamingConfig = useDeprecatedStreamingConfig
  }

  func urlSession(
    _ session: URLSession,
    didReceive challenge: URLAuthenticationChallenge,
    completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void
  ) {
    let (disposition, credential) = InsecureTls.shared.handle(challenge)
    completionHandler(disposition, credential)
  }

  func urlSession(
    _ session: URLSession,
    dataTask: URLSessionDataTask,
    didReceive response: URLResponse,
    completionHandler: @escaping (URLSession.ResponseDisposition) -> Void
  ) {
    let result = LynxHttpResponse()
    result.url = response.url?.absoluteString
    if let http = response as? HTTPURLResponse {
      result.statusText = "OK"
      result.httpHeaders = http.allHeaderFields
      result.statusCode = http.statusCode
    }
    callback(result)
    completionHandler(.allow)
  }

  func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
    if useDeprecatedStreamingConfig {
      delegate.processChunkedData(buffer, with: data)
    } else {
      delegate.processStreamingData(data)
    }
  }

  func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
    if let error {
      delegate.onError(error.localizedDescription)
    }
    delegate.onEnd()
  }
}
