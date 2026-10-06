import Foundation
import CryptoKit
import Darwin

/// Persistent identity-aware media. One process-wide writer also owns legacy downloads.
final class SongCacheStore {
  struct Failure: Error { let code: String }
  struct Snapshot: Codable {
    let id: Int
    let type: String
    let title: String
    let artist: String
    let album: String
    let duration: Double
    let isVideo: Bool
    let format: String
    let updatedAt: String
  }
  struct Request: Decodable {
    let task_id: String
    let namespace: String
    let key: String
    let snapshot: Snapshot
    let url: String
    let max_bytes: Int
  }
  struct Entry: Codable {
    let namespace: String
    let key: String
    let snapshot: Snapshot
    let sizeBytes: Int
    let createdAt: Int
  }
  private final class Job {
    let id: String
    let namespace: String
    let key: String
    var status = "waiting"
    var bytes = 0
    var total = 0
    var error: String?
    var cancelled = false
    var transfer: SongCacheTransfer?
    init(_ id: String, _ namespace: String, _ key: String) {
      self.id = id; self.namespace = namespace; self.key = key
    }
    var json: [String: Any] {
      ["task_id": id, "namespace": namespace, "key": key, "status": status,
        "bytes": bytes, "total": total, "error": error as Any? ?? NSNull()]
    }
  }
  typealias TrustChallenge = (URLAuthenticationChallenge) -> (URLSession.AuthChallengeDisposition, URLCredential?)
  private let root: URL
  private let indexed: URL
  private let tasks: URL
  private let staging: URL
  private let trustChallenge: TrustChallenge
  private let lock = NSRecursiveLock()
  private let writer = DispatchQueue(label: "org.songloft.cache.writer")
  private let fm = FileManager.default
  private var entries: [String: Entry] = [:]
  private var jobs: [String: Job] = [:]
  private var cancellations: [String] = []

  init(root: URL, trustChallenge: @escaping TrustChallenge = { _ in (.performDefaultHandling, nil) }) throws {
    self.root = root; self.trustChallenge = trustChallenge
    indexed = root.appendingPathComponent("v2", isDirectory: true)
    tasks = root.appendingPathComponent("tasks", isDirectory: true)
    staging = root.appendingPathComponent("staging", isDirectory: true)
    for directory in [root, indexed, tasks, staging] {
      try fm.createDirectory(at: directory, withIntermediateDirectories: true)
    }
    for file in children(staging) + children(tasks).filter({ $0.pathExtension == "part" }) + children(root).filter({ $0.pathExtension == "part" }) {
      try fm.removeItem(at: file)
    }
    for namespace in children(indexed) where Self.matches(namespace.lastPathComponent, "[a-f0-9]{64}") {
      for directory in children(namespace) {
        do {
          let entry = try JSONDecoder().decode(Entry.self, from: Data(contentsOf: directory.appendingPathComponent("entry.json")))
          _ = try identity(entry.namespace, entry.key)
          guard directory == entryDirectory(entry.namespace, entry.key), entry.sizeBytes > 0,
            sizeOf(media(entry)) == entry.sizeBytes else { throw Failure(code: "invalid_cache_request") }
          entries[entry.key] = entry
        } catch { try fm.removeItem(at: directory) }
      }
    }
    for file in children(tasks) where file.pathExtension == "json" {
      do {
        var value = try object(Data(contentsOf: file))
        guard let id = value["task_id"] as? String, Self.matches(id, "[A-Za-z0-9_-]{1,96}"), file.deletingPathExtension().lastPathComponent == id else {
          throw Failure(code: "invalid_cache_request")
        }
        if ["waiting", "downloading"].contains(value["status"] as? String ?? "") {
          value["status"] = "interrupted"; value["error"] = "interrupted"
          try atomic(file, Self.encode(value))
        }
      } catch { try fm.removeItem(at: file) }
    }
    pruneTasks()
  }
  private func locked<T>(_ action: () throws -> T) rethrows -> T {
    lock.lock(); defer { lock.unlock() }; return try action()
  }
  static func matches(_ value: String, _ pattern: String) -> Bool {
    value.range(of: "^(?:\(pattern))$", options: .regularExpression) != nil
  }
  static func encode(_ value: Any) throws -> Data {
    try JSONSerialization.data(withJSONObject: value, options: [.withoutEscapingSlashes, .sortedKeys])
  }
  private func object(_ data: Data) throws -> [String: Any] {
    guard data.count <= 65536, let value = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
      throw Failure(code: "invalid_cache_request")
    }
    return value
  }
  private func namespace(_ value: String) throws {
    guard value.utf8.count <= 4096, let parts = try JSONSerialization.jsonObject(with: Data(value.utf8)) as? [String],
      parts.count == 3, (1...128).contains(parts[0].count), (1...256).contains(parts[2].count),
      let url = URL(string: parts[1]), SongCacheTransfer.validURL(url), url.query == nil, url.fragment == nil,
      !parts[1].unicodeScalars.contains(where: { $0.value <= 32 || $0.value == 92 }) else {
      throw Failure(code: "invalid_cache_request")
    }
  }
  private func identity(_ ns: String, _ key: String) throws -> [String] {
    try namespace(ns)
    guard key.utf8.count <= 8192, let parts = try JSONSerialization.jsonObject(with: Data(key.utf8)) as? [String],
      parts.count == 7, parts[0] == ns, Self.matches(parts[1], "[1-9][0-9]{0,14}"),
      Self.matches(parts[2], "default|[0-9]{1,6}"), ["original", "320", "192", "128"].contains(parts[3]),
      ["0", "1"].contains(parts[4]), (1...128).contains(parts[5].count), Self.matches(parts[6], "[a-z0-9]{1,12}") else {
      throw Failure(code: "invalid_cache_request")
    }
    return parts
  }
  private func hash(_ value: String) -> String { SHA256.hash(data: Data(value.utf8)).map { String(format: "%02x", $0) }.joined() }
  private func entryDirectory(_ ns: String, _ key: String) -> URL {
    indexed.appendingPathComponent(hash(ns), isDirectory: true).appendingPathComponent(hash(key), isDirectory: true)
  }
  private func media(_ entry: Entry) -> URL {
    let parts = (try? identity(entry.namespace, entry.key)) ?? []
    return entryDirectory(entry.namespace, entry.key).appendingPathComponent("media.\(parts.last ?? "invalid")")
  }
  private func children(_ directory: URL) -> [URL] {
    (try? fm.contentsOfDirectory(at: directory, includingPropertiesForKeys: [.isRegularFileKey, .contentModificationDateKey])) ?? []
  }
  private func sizeOf(_ file: URL) -> Int {
    guard (try? file.resourceValues(forKeys: [.isRegularFileKey]).isRegularFile) == true else { return -1 }
    return (try? fm.attributesOfItem(atPath: file.path)[.size] as? NSNumber)?.intValue ?? -1
  }
  private func legacyFiles() -> [URL] {
    children(root).filter { Self.matches($0.lastPathComponent, "[1-9][0-9]*(?:\\.[a-z0-9]{1,12})?") && sizeOf($0) >= 0 }
  }
  private func legacySize() -> Int { legacyFiles().reduce(0) { $0 + max(0, sizeOf($1)) } }
  func size() -> Int { locked { legacySize() + entries.values.reduce(0) { $0 + max(0, sizeOf(media($1))) } } }
  private func sameVariant(_ first: String, _ second: String) -> Bool {
    guard let a = try? JSONSerialization.jsonObject(with: Data(first.utf8)) as? [String],
      let b = try? JSONSerialization.jsonObject(with: Data(second.utf8)) as? [String] else { return false }
    return a.count == 7 && b.count == 7 && Array(a.prefix(6)) == Array(b.prefix(6))
  }
  private func available(_ ns: String, _ key: String) -> Entry? {
    entries.values.first { $0.namespace == ns && sameVariant($0.key, key) && sizeOf(media($0)) == $0.sizeBytes }
  }
  private func playable(_ entry: Entry) throws -> [String: Any] {
    var value = try object(JSONEncoder().encode(entry))
    value["cached"] = true; value["url"] = media(entry).absoluteString
    return value
  }
  func getEntry(_ raw: String) throws -> [String: Any] { try locked {
    let request = try object(Data(raw.utf8))
    guard let ns = request["namespace"] as? String else { throw Failure(code: "invalid_cache_request") }
    try namespace(ns)
    var found: Entry?
    if let key = request["key"] as? String {
      _ = try identity(ns, key); found = available(ns, key)
    } else if let id = request["song_id"] as? Int {
      found = entries.values.first { $0.namespace == ns && $0.snapshot.id == id && sizeOf(media($0)) == $0.sizeBytes }
    } else { throw Failure(code: "invalid_cache_request") }
    if let found { return try playable(found) }; return ["cached": false]
  } }
  func listEntries(_ raw: String) throws -> [String: Any] { try locked {
    let request = try object(Data(raw.utf8))
    guard let ns = request["namespace"] as? String else { throw Failure(code: "invalid_cache_request") }
    try namespace(ns)
    let offset = request["offset"] as? Int ?? 0, limit = request["limit"] as? Int ?? 50
    guard offset >= 0, (1...200).contains(limit) else { throw Failure(code: "invalid_cache_request") }
    let all = entries.values.filter { $0.namespace == ns && sizeOf(media($0)) == $0.sizeBytes }.sorted { $0.key < $1.key }
    return ["entries": try all.dropFirst(offset).prefix(limit).map(playable), "total": all.count, "bytes": size(), "legacy_bytes": legacySize()]
  } }
  private func atomic(_ file: URL, _ data: Data) throws {
    let temporary = file.appendingPathExtension("part")
    defer { try? fm.removeItem(at: temporary) }
    guard fm.createFile(atPath: temporary.path, contents: nil) else { throw Failure(code: "cache_storage_unavailable") }
    let handle = try FileHandle(forWritingTo: temporary)
    defer { try? handle.close() }
    try handle.write(contentsOf: data); try handle.synchronize()
    guard Darwin.rename(temporary.path, file.path) == 0 else { throw Failure(code: "cache_storage_unavailable") }
  }
  private func save(_ job: Job) throws { try atomic(tasks.appendingPathComponent("\(job.id).json"), Self.encode(job.json)) }
  private func pruneTasks() {
    let sorted = children(tasks).filter { $0.pathExtension == "json" }.sorted {
      ((try? $0.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate) ?? .distantPast) >
        ((try? $1.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate) ?? .distantPast)
    }
    for file in sorted.dropFirst(128) where jobs[file.deletingPathExtension().lastPathComponent] == nil { try? fm.removeItem(at: file) }
  }
  func getTasks() -> [String: Any] { locked {
    ["tasks": children(tasks).filter { $0.pathExtension == "json" }.compactMap { file -> [String: Any]? in
      jobs[file.deletingPathExtension().lastPathComponent]?.json ?? (try? object(Data(contentsOf: file)))
    }]
  } }
  func cancel(_ id: String) {
    guard Self.matches(id, "[A-Za-z0-9_-]{1,96}") else { return }
    let transfer: SongCacheTransfer? = locked {
      jobs[id]?.cancelled = true
      cancellations.removeAll { $0 == id }; cancellations.append(id)
      if cancellations.count > 64 { cancellations.removeFirst() }
      return jobs[id]?.transfer
    }
    transfer?.cancel() // Never invert the store/transfer lock order.
  }
  static func failure(_ error: Error) -> [String: Any] {
    ["error": (error as? Failure)?.code ?? "download_failed"]
  }
  func cacheEntry(_ raw: String, progress: @escaping ([String: Any]) -> Void, callback: @escaping ([String: Any]) -> Void) {
    do {
      guard raw.utf8.count <= 65536 else { throw Failure(code: "invalid_cache_request") }
      let request = try JSONDecoder().decode(Request.self, from: Data(raw.utf8))
      let parts = try identity(request.namespace, request.key), snapshot = request.snapshot
      guard String(snapshot.id) == parts[1], ["local", "remote"].contains(snapshot.type), (1...1024).contains(snapshot.title.count),
        snapshot.artist.count <= 1024, snapshot.album.count <= 1024, snapshot.duration.isFinite, snapshot.duration >= 0,
        snapshot.format.count <= 12, snapshot.updatedAt.count <= 128 else { throw Failure(code: "invalid_cache_request") }
      try enqueue(id: request.task_id, ns: request.namespace, key: request.key, snapshot: snapshot,
        url: request.url, maximum: request.max_bytes, legacy: nil, progress: progress, callback: callback)
    } catch { callback(Self.failure(error)) }
  }
  private func enqueue(id: String, ns: String, key: String, snapshot: Snapshot?, url raw: String, maximum: Int,
    legacy: URL?, progress: @escaping ([String: Any]) -> Void, callback: @escaping ([String: Any]) -> Void) throws {
    guard Self.matches(id, "[A-Za-z0-9_-]{1,96}"), maximum > 0, maximum <= 9007199254740991,
      let url = URL(string: raw), SongCacheTransfer.validURL(url), !raw.unicodeScalars.contains(where: { $0.value <= 32 || $0.value == 92 }) else {
      throw Failure(code: "invalid_cache_request")
    }
    let job = Job(id, ns, key)
    try locked {
      guard jobs.count < 32 else { throw Failure(code: "cache_queue_full") }
      guard jobs[id] == nil, !fm.fileExists(atPath: tasks.appendingPathComponent("\(id).json").path) else { throw Failure(code: "invalid_cache_request") }
      guard !jobs.values.contains(where: { !key.isEmpty && $0.namespace == ns && sameVariant($0.key, key) }) else { throw Failure(code: "cache_busy") }
      job.cancelled = cancellations.contains(id); try save(job); jobs[id] = job
    }
    writer.async {
      let temporary = self.staging.appendingPathComponent(id, isDirectory: true)
      var result: [String: Any] = [:]
      do {
        if self.locked({ job.cancelled }) { throw Failure(code: "cancelled") }
        if legacy == nil, let existing = self.locked({ self.available(ns, key) }) {
          result = try self.playable(existing)
        } else {
          let remaining = maximum - self.size()
          guard remaining > 0 else { throw Failure(code: "limit_exceeded") }
          try self.fm.createDirectory(at: temporary, withIntermediateDirectories: false)
          let part = temporary.appendingPathComponent("media.part"), done = DispatchSemaphore(value: 0)
          var downloaded: Result<(Int, String), Error> = .failure(Failure(code: "download_failed"))
          let planned = try legacy?.pathExtension ?? self.identity(ns, key).last!
          let transfer = try SongCacheTransfer(url: url, file: part, remaining: remaining, plannedFormat: planned,
            indexed: legacy == nil, trustChallenge: self.trustChallenge, progress: { bytes, total in
              let event = self.locked { job.bytes = bytes; job.total = total; return job.json }
              progress(event)
            }, completion: { value in downloaded = value; done.signal() })
          try self.locked { job.transfer = transfer; job.status = "downloading"; try self.save(job) }
          if self.locked({ job.cancelled }) { transfer.cancel() }
          progress(self.locked { job.json }); transfer.start(); done.wait()
          let (bytes, format) = try downloaded.get()
          try self.locked {
            guard !job.cancelled else { throw Failure(code: "cancelled") }
            if let legacy {
              guard Darwin.rename(part.path, legacy.path) == 0 else { throw Failure(code: "cache_storage_unavailable") }
              result = ["path": legacy.absoluteString]
            } else {
              var parts = try self.identity(ns, key); parts[6] = format
              let actual = String(decoding: try Self.encode(parts), as: UTF8.self)
              let entry = Entry(namespace: ns, key: actual, snapshot: snapshot!, sizeBytes: bytes, createdAt: Int(Date().timeIntervalSince1970 * 1000))
              try self.fm.moveItem(at: part, to: temporary.appendingPathComponent("media.\(format)"))
              try self.atomic(temporary.appendingPathComponent("entry.json"), JSONEncoder().encode(entry))
              let destination = self.entryDirectory(ns, actual)
              try self.fm.createDirectory(at: destination.deletingLastPathComponent(), withIntermediateDirectories: true)
              try self.fm.moveItem(at: temporary, to: destination)
              self.entries[actual] = entry; result = try self.playable(entry)
            }
          }
        }
        self.locked { job.status = "completed" }
      } catch {
        self.locked {
          job.error = job.cancelled ? "cancelled" : Self.failure(error)["error"] as? String
          job.status = job.cancelled ? "cancelled" : "failed"; result = ["error": job.error ?? "download_failed"]
        }
      }
      do { if self.fm.fileExists(atPath: temporary.path) { try self.fm.removeItem(at: temporary) } }
      catch { result = ["error": "cache_storage_unavailable"]; self.locked { job.status = "failed"; job.error = "cache_storage_unavailable" } }
      self.locked {
        job.transfer = nil; self.jobs.removeValue(forKey: id)
        do { try self.save(job); self.pruneTasks() }
        catch { job.status = "failed"; job.error = "cache_storage_unavailable"; result = ["error": "cache_storage_unavailable"] }
      }
      progress(self.locked { job.json }); callback(result)
    }
  }
  private func mutate(_ callback: @escaping ([String: Any]) -> Void, _ action: @escaping () throws -> Void) {
    writer.async {
      do { try self.locked(action); callback([:]) } catch { callback(Self.failure(error)) }
    }
  }
  func remove(_ raw: String, callback: @escaping ([String: Any]) -> Void) { mutate(callback) {
    let request = try self.object(Data(raw.utf8))
    guard let ns = request["namespace"] as? String else { throw Failure(code: "invalid_cache_request") }
    try self.namespace(ns)
    let key = request["key"] as? String, id = request["song_id"] as? Int
    if let key { _ = try self.identity(ns, key) }
    guard key != nil || id != nil else { throw Failure(code: "invalid_cache_request") }
    for entry in Array(self.entries.values) where entry.namespace == ns && (key.map { self.sameVariant(entry.key, $0) } ?? (entry.snapshot.id == id)) {
      try self.fm.removeItem(at: self.entryDirectory(ns, entry.key)); self.entries.removeValue(forKey: entry.key)
    }
  } }
  func clearNamespace(_ ns: String, callback: @escaping ([String: Any]) -> Void) {
    do { try namespace(ns) } catch { callback(Self.failure(error)); return }
    let owned = locked { jobs.values.filter { $0.namespace == ns }.map { $0.id } }; owned.forEach(cancel)
    mutate(callback) {
      for entry in Array(self.entries.values) where entry.namespace == ns {
        try self.fm.removeItem(at: self.entryDirectory(ns, entry.key)); self.entries.removeValue(forKey: entry.key)
      }
    }
  }
  func clearLegacy(_ callback: @escaping ([String: Any]) -> Void) {
    locked { jobs.values.filter { $0.namespace.isEmpty }.map { $0.id } }.forEach(cancel)
    mutate(callback) { for file in self.legacyFiles() { try self.fm.removeItem(at: file) } }
  }
  func clearAll(_ callback: @escaping ([String: Any]) -> Void) {
    locked { Array(jobs.keys) }.forEach(cancel)
    mutate(callback) {
      for file in self.legacyFiles() + self.children(self.indexed) { try self.fm.removeItem(at: file) }; self.entries.removeAll()
    }
  }
  func legacyDownload(_ id: String, url: String, ext: String, maximum: Double, callback: @escaping ([String: Any]) -> Void) {
    do {
      let ext = ext.hasPrefix(".") ? String(ext.dropFirst()) : ext
      guard Self.matches(id, "[1-9][0-9]{0,14}"), Self.matches(ext, "[a-z0-9]{0,12}"), maximum.isFinite,
        maximum > 0, maximum <= 9007199254740991, maximum.rounded(.down) == maximum else { throw Failure(code: "invalid_cache_request") }
      let file = root.appendingPathComponent(ext.isEmpty ? id : "\(id).\(ext)")
      try enqueue(id: "legacy-\(UUID().uuidString)", ns: "", key: "", snapshot: nil, url: url, maximum: Int(maximum), legacy: file, progress: { _ in }, callback: callback)
    } catch { callback(Self.failure(error)) }
  }
  func legacyInfo(_ id: String) -> [String: Any] { locked {
    guard let file = legacyFiles().first(where: { $0.lastPathComponent == id || $0.lastPathComponent.hasPrefix("\(id).") }) else { return ["cached": false] }
    return ["cached": true, "url": file.absoluteString, "sizeBytes": sizeOf(file)]
  } }
  func legacyRemove(_ id: String, callback: @escaping ([String: Any]) -> Void) { mutate(callback) {
    for file in self.legacyFiles() where file.lastPathComponent == id || file.lastPathComponent.hasPrefix("\(id).") { try self.fm.removeItem(at: file) }
  } }
}
