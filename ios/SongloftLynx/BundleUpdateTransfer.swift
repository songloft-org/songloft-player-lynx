import Foundation

/// Bounded file streaming with system TLS. It never uses the music-server TLS bypass session.
final class BundleUpdateTransfer: NSObject, URLSessionDataDelegate {
  let id: String
  let total: Int
  private let url: URL
  private let output: FileHandle
  private let progress: (Int, Int) -> Void
  private let completion: (Result<Void, Error>) -> Void
  private let lock = NSLock()
  private var written = 0
  private var wasCancelled = false
  private var failure: BundleUpdateStore.Failure?
  private var lastEvent = 0.0
  private var session: URLSession?
  private var task: URLSessionDataTask?

  var bytes: Int { locked { written } }
  var cancelled: Bool { locked { wasCancelled } }

  static func validURL(_ url: URL) -> Bool {
    guard url.scheme?.lowercased() == "https", url.host != nil, url.user == nil, url.password == nil else { return false }
    return !(URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? []).contains {
      ["access_token", "token"].contains($0.name.lowercased())
    }
  }
  init(id: String, url: URL, file: URL, total: Int, progress: @escaping (Int, Int) -> Void,
    completion: @escaping (Result<Void, Error>) -> Void) throws {
    self.id = id; self.url = url; self.total = total; self.progress = progress; self.completion = completion
    guard FileManager.default.createFile(atPath: file.path, contents: nil) else {
      throw BundleUpdateStore.Failure(code: "update_storage_unavailable")
    }
    output = try FileHandle(forWritingTo: file)
    super.init()
  }
  private func locked<T>(_ action: () throws -> T) rethrows -> T {
    lock.lock(); defer { lock.unlock() }; return try action()
  }
  func start() {
    locked {
      let configuration = URLSessionConfiguration.ephemeral
      configuration.timeoutIntervalForRequest = 30
      configuration.timeoutIntervalForResource = 180
      configuration.httpCookieStorage = nil
      configuration.urlCredentialStorage = nil
      let queue = OperationQueue()
      queue.maxConcurrentOperationCount = 1
      let session = URLSession(configuration: configuration, delegate: self, delegateQueue: queue)
      self.session = session
      task = session.dataTask(with: url)
      task?.resume()
    }
    progress(0, total)
  }
  func cancel() {
    locked { wasCancelled = true; task?.cancel() }
  }
  func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
    newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
    // Redirect credentials are never attached by us; still enforce HTTPS at every hop.
    guard let url = request.url, Self.validURL(url) else {
      locked { failure = BundleUpdateStore.Failure(code: "invalid_update_url") }
      completionHandler(nil)
      return
    }
    completionHandler(request)
  }
  func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive response: URLResponse,
    completionHandler: @escaping (URLSession.ResponseDisposition) -> Void) {
    let allowed = locked { () -> Bool in
      guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode),
        let url = response.url, Self.validURL(url) else {
        failure = BundleUpdateStore.Failure(code: "download_failed"); return false
      }
      guard response.expectedContentLength < 0 || response.expectedContentLength == Int64(total) else {
        failure = BundleUpdateStore.Failure(code: "checksum_mismatch"); return false
      }
      return !wasCancelled
    }
    completionHandler(allowed ? .allow : .cancel)
  }
  func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
    var report: Int?
    locked {
      guard !wasCancelled, failure == nil else { dataTask.cancel(); return }
      written += data.count
      guard written <= total, written <= BundleUpdateStore.maximumBundle else {
        failure = BundleUpdateStore.Failure(code: "checksum_mismatch"); dataTask.cancel(); return
      }
      do { try output.write(contentsOf: data) }
      catch { failure = BundleUpdateStore.Failure(code: "update_storage_unavailable"); dataTask.cancel(); return }
      let now = ProcessInfo.processInfo.systemUptime
      if written == total || now - lastEvent >= 0.1 { lastEvent = now; report = written }
    }
    if let report { progress(report, total) }
  }
  func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
    let result: Result<Void, Error> = locked {
      do {
        defer { try? output.close() }
        if wasCancelled { throw BundleUpdateStore.Failure(code: "cancelled") }
        if let failure { throw failure }
        if error != nil { throw BundleUpdateStore.Failure(code: "download_failed") }
        guard written == total else { throw BundleUpdateStore.Failure(code: "checksum_mismatch") }
        try output.synchronize()
        return .success(())
      } catch { return .failure(error) }
    }
    // Do not hold transfer lock while the store persists state (store -> transfer read order).
    completion(result)
    session.finishTasksAndInvalidate()
    locked { self.task = nil; self.session = nil }
  }
}
