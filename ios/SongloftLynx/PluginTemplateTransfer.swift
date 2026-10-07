import Foundation

/// A per-request streaming session for plugin bundles; root update verification is separate.
final class PluginTemplateTransfer: NSObject, URLSessionDataDelegate {
  private let limit: Int
  private let timeout: TimeInterval
  private let completion: (Data?, Error?) -> Void
  private let lock = NSLock()
  private var body = Data()
  private var redirects = 0
  private var failure: Error?
  private var completed = false
  private var session: URLSession?
  private var task: URLSessionDataTask?
  private var tlsListener: UUID?

  private init(limit: Int, timeout: TimeInterval, completion: @escaping (Data?, Error?) -> Void) {
    self.limit = limit
    self.timeout = timeout
    self.completion = completion
    super.init()
  }

  static func error(_ message: String) -> NSError {
    NSError(domain: "org.songloft.lynx.template", code: 1,
            userInfo: [NSLocalizedDescriptionKey: message])
  }

  private static func validURL(_ url: URL) -> Bool {
    ["http", "https"].contains(url.scheme?.lowercased() ?? "") &&
      !(url.host ?? "").isEmpty && url.user == nil && url.password == nil
  }

  static func fetch(_ address: String, limit: Int = 50 * 1024 * 1024, timeout: TimeInterval = 30,
                    completion: @escaping (Data?, Error?) -> Void) {
    guard limit > 0, timeout.isFinite, timeout > 0, !address.unicodeScalars.contains(where: {
      $0.value <= 32 || $0.value == 92 || $0.value == 127
    }), let url = URL(string: address), validURL(url) else {
      completion(nil, error("Invalid plugin template URL"))
      return
    }
    PluginTemplateTransfer(limit: limit, timeout: timeout, completion: completion).start(url)
  }

  private func locked<T>(_ action: () -> T) -> T {
    lock.lock()
    defer { lock.unlock() }
    return action()
  }

  private func start(_ url: URL) {
    let started: URLSessionDataTask = locked {
      tlsListener = InsecureTls.shared.addListener { [weak self] in self?.cancelForTLSChange() }
      let config = URLSessionConfiguration.ephemeral
      config.timeoutIntervalForRequest = timeout
      config.timeoutIntervalForResource = timeout
      config.httpCookieStorage = nil
      config.httpShouldSetCookies = false
      config.urlCredentialStorage = nil
      config.urlCache = nil
      let queue = OperationQueue()
      queue.maxConcurrentOperationCount = 1
      let session = URLSession(configuration: config, delegate: self, delegateQueue: queue)
      self.session = session
      let task = session.dataTask(with: URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData,
                                                 timeoutInterval: timeout))
      self.task = task
      return task
    }
    // A concurrent TLS change may cancel before resume; completion still releases the session.
    started.resume()
  }

  private func cancelForTLSChange() {
    let cancelled: URLSessionDataTask? = locked {
      guard !completed else { return nil }
      failure = Self.error("TLS policy changed")
      return task
    }
    cancelled?.cancel()
  }

  func urlSession(_ session: URLSession, didReceive challenge: URLAuthenticationChallenge,
                  completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void) {
    answer(challenge, completionHandler: completionHandler)
  }

  func urlSession(_ session: URLSession, task: URLSessionTask, didReceive challenge: URLAuthenticationChallenge,
                  completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void) {
    answer(challenge, completionHandler: completionHandler)
  }

  private func answer(_ challenge: URLAuthenticationChallenge,
                      completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void) {
    guard challenge.protectionSpace.authenticationMethod == NSURLAuthenticationMethodServerTrust else {
      completionHandler(.rejectProtectionSpace, nil)
      return
    }
    let (disposition, credential) = InsecureTls.shared.handle(challenge)
    completionHandler(disposition, credential)
  }

  func urlSession(_ session: URLSession, task: URLSessionTask,
                  willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest,
                  completionHandler: @escaping (URLRequest?) -> Void) {
    let next: URLRequest? = locked {
      guard !completed, failure == nil else { return nil }
      redirects += 1
      guard redirects <= 5,
            let location = response.value(forHTTPHeaderField: "Location"),
            let declared = URL(string: location, relativeTo: response.url)?.absoluteURL,
            Self.validURL(declared), let url = request.url, Self.validURL(url) else {
        failure = Self.error("Invalid plugin template redirect")
        return nil
      }
      body.removeAll(keepingCapacity: true)
      // Recreate the request so redirects cannot inherit account or authentication headers.
      return URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: timeout)
    }
    completionHandler(next)
  }

  func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive response: URLResponse,
                  completionHandler: @escaping (URLSession.ResponseDisposition) -> Void) {
    let allowed: Bool = locked {
      guard !completed, failure == nil else { return false }
      guard let response = response as? HTTPURLResponse,
            let url = response.url, Self.validURL(url) else {
        failure = Self.error("Invalid plugin template response")
        return false
      }
      guard (200..<300).contains(response.statusCode) else {
        failure = Self.error("Plugin template HTTP \(response.statusCode)")
        return false
      }
      guard response.expectedContentLength <= Int64(limit) else {
        failure = Self.error("Plugin template too large")
        return false
      }
      return true
    }
    completionHandler(allowed ? .allow : .cancel)
  }

  func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive chunk: Data) {
    let cancelled: Bool = locked {
      guard !completed, failure == nil else { return true }
      guard chunk.count <= limit - body.count else {
        failure = Self.error("Plugin template too large")
        return true
      }
      body.append(chunk)
      return false
    }
    if cancelled { dataTask.cancel() }
  }

  func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
    lock.lock()
    guard !completed else { lock.unlock(); return }
    completed = true
    let resultError = failure ?? error ?? (body.isEmpty ? Self.error("Empty plugin template") : nil)
    let data: Data? = resultError == nil ? body : nil
    body.removeAll(keepingCapacity: false)
    let listener = tlsListener
    tlsListener = nil
    self.session = nil
    self.task = nil
    lock.unlock()
    if let listener { InsecureTls.shared.removeListener(listener) }
    session.finishTasksAndInvalidate()
    completion(data, resultError)
  }
}
