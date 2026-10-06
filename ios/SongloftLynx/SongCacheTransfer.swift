import Foundation

/// Media streaming uses the user's server trust policy, unlike the signed updater.
final class SongCacheTransfer: NSObject, URLSessionDataDelegate {
  private let url: URL
  private let file: URL
  private let remaining: Int
  private let indexed: Bool
  private let output: FileHandle
  private let trustChallenge: SongCacheStore.TrustChallenge
  private let progress: (Int, Int) -> Void
  private let completion: (Result<(Int, String), Error>) -> Void
  private let lock = NSLock()
  private var format: String
  private var bytes = 0
  private var total = 0
  private var cancelled = false
  private var failure: SongCacheStore.Failure?
  private var lastEvent = 0.0
  private var redirects = 0
  private var task: URLSessionDataTask?

  static func validURL(_ url: URL) -> Bool {
    ["http", "https"].contains(url.scheme?.lowercased() ?? "") && url.host != nil && url.user == nil && url.password == nil
  }
  init(url: URL, file: URL, remaining: Int, plannedFormat: String, indexed: Bool,
    trustChallenge: @escaping SongCacheStore.TrustChallenge, progress: @escaping (Int, Int) -> Void,
    completion: @escaping (Result<(Int, String), Error>) -> Void) throws {
    self.url = url; self.file = file; self.remaining = remaining; self.format = plannedFormat; self.indexed = indexed
    self.trustChallenge = trustChallenge; self.progress = progress; self.completion = completion
    guard FileManager.default.createFile(atPath: file.path, contents: nil) else { throw SongCacheStore.Failure(code: "cache_storage_unavailable") }
    output = try FileHandle(forWritingTo: file)
    super.init()
  }
  deinit { try? output.close() }
  private func locked<T>(_ action: () -> T) -> T { lock.lock(); defer { lock.unlock() }; return action() }
  private func freeSpace() -> Int {
    (try? FileManager.default.attributesOfFileSystem(forPath: file.deletingLastPathComponent().path)[.systemFreeSize] as? NSNumber)?.intValue ?? 0
  }
  func start() {
    let configuration = URLSessionConfiguration.ephemeral
    configuration.timeoutIntervalForRequest = 30
    configuration.timeoutIntervalForResource = 15 * 60
    configuration.httpCookieStorage = nil; configuration.urlCredentialStorage = nil; configuration.urlCache = nil
    let queue = OperationQueue(); queue.maxConcurrentOperationCount = 1
    let session = URLSession(configuration: configuration, delegate: self, delegateQueue: queue)
    let task = session.dataTask(with: url)
    let wasCancelled = locked { self.task = task; return cancelled }
    task.resume()
    if wasCancelled { task.cancel() }
  }
  func cancel() { let task = locked { cancelled = true; return self.task }; task?.cancel() }
  func urlSession(_ session: URLSession, didReceive challenge: URLAuthenticationChallenge,
    completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void) {
    let (disposition, credential) = trustChallenge(challenge); completionHandler(disposition, credential)
  }
  func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
    newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
    redirects += 1
    guard redirects <= 8, let url = request.url, Self.validURL(url) else {
      locked { failure = SongCacheStore.Failure(code: "download_failed") }; completionHandler(nil); return
    }
    completionHandler(request)
  }
  private func actualFormat(_ contentType: String?) throws -> String {
    switch contentType?.split(separator: ";", maxSplits: 1).first?.trimmingCharacters(in: .whitespaces).lowercased() {
    case "audio/mpeg", "audio/mp3": return "mp3"
    case "audio/flac", "audio/x-flac": return "flac"
    case "audio/mp4": return "m4a"
    case "video/mp4": return "mp4"
    case "audio/aac": return "aac"
    case "audio/wav", "audio/x-wav", "audio/wave": return "wav"
    case "audio/ogg", "application/ogg": return format == "opus" ? "opus" : "ogg"
    case "text/html", "application/json", "application/vnd.apple.mpegurl", "application/x-mpegurl", "audio/mpegurl":
      throw SongCacheStore.Failure(code: "unsupported_media")
    default: return format
    }
  }
  func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive response: URLResponse,
    completionHandler: @escaping (URLSession.ResponseDisposition) -> Void) {
    let allowed = locked { () -> Bool in
      do {
        guard !cancelled else { throw SongCacheStore.Failure(code: "cancelled") }
        guard let response = response as? HTTPURLResponse, (200..<300).contains(response.statusCode),
          let url = response.url, Self.validURL(url) else { throw SongCacheStore.Failure(code: "download_failed") }
        if indexed && response.value(forHTTPHeaderField: "Content-Range") != nil { throw SongCacheStore.Failure(code: "unsupported_media") }
        total = max(0, Int(response.expectedContentLength))
        guard total <= remaining else { throw SongCacheStore.Failure(code: "limit_exceeded") }
        guard freeSpace() >= total + 524288 else { throw SongCacheStore.Failure(code: "insufficient_space") }
        if indexed { format = try actualFormat(response.value(forHTTPHeaderField: "Content-Type")) }
        return true
      } catch { failure = (error as? SongCacheStore.Failure) ?? SongCacheStore.Failure(code: "download_failed"); return false }
    }
    completionHandler(allowed ? .allow : .cancel)
  }
  func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
    let event: (Int, Int)? = locked {
      guard !cancelled, failure == nil else { dataTask.cancel(); return nil }
      guard data.count <= remaining - bytes else { failure = SongCacheStore.Failure(code: "limit_exceeded"); dataTask.cancel(); return nil }
      guard freeSpace() >= data.count + 524288 else { failure = SongCacheStore.Failure(code: "insufficient_space"); dataTask.cancel(); return nil }
      do { try output.write(contentsOf: data); bytes += data.count }
      catch { failure = SongCacheStore.Failure(code: "cache_storage_unavailable"); dataTask.cancel(); return nil }
      let now = ProcessInfo.processInfo.systemUptime
      if now - lastEvent >= 0.1 { lastEvent = now; return (bytes, total) }
      return nil
    }
    if let event { progress(event.0, event.1) } // No transfer lock held while accessing the store.
  }
  func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
    let result: Result<(Int, String), Error> = locked {
      do {
        defer { try? output.close() }
        if cancelled { throw SongCacheStore.Failure(code: "cancelled") }
        if let failure { throw failure }
        guard error == nil, bytes > 0, total == 0 || bytes == total else { throw SongCacheStore.Failure(code: "download_failed") }
        try output.synchronize(); return .success((bytes, format))
      } catch { return .failure(error) }
    }
    progress(locked { bytes }, locked { total })
    completion(result); session.finishTasksAndInvalidate(); locked { self.task = nil }
  }
}
