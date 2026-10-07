import Foundation

/// Runs the actual Foundation/CryptoKit cache core on Apple, independently of Lynx/UIKit.
@main
struct VerifyIOSCache {
  static func check(_ value: @autoclosure () throws -> Bool, _ message: String) throws {
    if !(try value()) { throw SongCacheStore.Failure(code: message) }
  }
  static func raw(_ value: Any) throws -> String { String(decoding: try SongCacheStore.encode(value), as: UTF8.self) }
  static func awaitCallback(_ action: (@escaping ([String: Any]) -> Void) -> Void) throws -> [String: Any] {
    let done = DispatchSemaphore(value: 0); var result: [String: Any] = [:]
    action { result = $0; done.signal() }
    guard done.wait(timeout: .now() + 15) == .success else { throw SongCacheStore.Failure(code: "verification_timeout") }
    return result
  }
  static func main() throws {
    guard CommandLine.arguments.count == 2, let port = Int(CommandLine.arguments[1]), (1...65535).contains(port) else {
      throw SongCacheStore.Failure(code: "expected_fixture_port")
    }
    let fm = FileManager.default, root = fm.temporaryDirectory.appendingPathComponent("cache-验证-\(UUID().uuidString)")
    defer { try? fm.removeItem(at: root) }
    let store = try SongCacheStore(root: root)
    let server = "http://127.0.0.1:\(port)"
    let ns = try raw(["profile", server + "/部署", "user"]), other = try raw(["other", server, "user"])
    func request(_ id: String, namespace: String? = nil, track: String = "default", path: String = "/media", maximum: Int = 8 * 1024 * 1024) throws -> String {
      let namespace = namespace ?? ns
      let key = try raw([namespace, "7", track, "original", "0", "revision", "flac"])
      let snapshot: [String: Any] = ["id": 7, "type": "local", "title": "测试", "artist": "", "album": "", "duration": 10,
        "isVideo": false, "format": "flac", "updatedAt": "revision", "url": "PRIVATE_SENTINEL"]
      return try raw(["task_id": id, "namespace": namespace, "key": key, "snapshot": snapshot, "url": server + path, "max_bytes": maximum])
    }
    func cache(_ input: String, progress: @escaping ([String: Any]) -> Void = { _ in }) throws -> [String: Any] {
      try awaitCallback { store.cacheEntry(input, progress: progress, callback: $0) }
    }
    let first = try cache(request("first")), second = try cache(request("second", namespace: other)), track = try cache(request("track", track: "1"))
    try check(first["cached"] as? Bool == true && second["cached"] as? Bool == true && track["cached"] as? Bool == true, "cache_commit")
    let urls = [first, second, track].compactMap { $0["url"] as? String }
    try check(Set(urls).count == 3, "identity_collision")
    for url in urls {
      guard let file = URL(string: url) else { throw SongCacheStore.Failure(code: "invalid_file_uri") }
      try check(file.isFileURL && file.pathExtension == "mp3", "actual_format")
      let media = try Data(contentsOf: file)
      try check(media.count == 32768, "media_size")
      let entry = try Data(contentsOf: file.deletingLastPathComponent().appendingPathComponent("entry.json"))
      try check(!String(decoding: entry, as: UTF8.self).contains("PRIVATE_SENTINEL"), "snapshot_leak")
    }
    try check((try store.listEntries(raw(["namespace": ns])))["total"] as? Int == 2, "namespace_listing")
    let repeated = try cache(request("repeat"))
    try check(repeated["url"] as? String == first["url"] as? String, "duplicate_variant")
    func verifyRestored(_ restored: SongCacheStore, entries: [[String: Any]], label: String) throws {
      for entry in entries {
        let found = try restored.getEntry(raw(["namespace": entry["namespace"]!, "key": entry["key"]!]))
        try check(found["cached"] as? Bool == true, label + "_lookup")
        try check(found["key"] as? String == entry["key"] as? String && found["sizeBytes"] as? Int == 32768, label + "_metadata")
        guard let value = found["url"] as? String, let file = URL(string: value), file.isFileURL else {
          throw SongCacheStore.Failure(code: label + "_file_uri")
        }
        let bytes = try Data(contentsOf: file)
        try check(bytes == Data(repeating: 109, count: 32768), label + "_media")
      }
      for namespace in [ns, other] {
        let expected = entries.filter { $0["namespace"] as? String == namespace }.count
        try check((try restored.listEntries(raw(["namespace": namespace])))["total"] as? Int == expected, label + "_listing")
      }
      try check(restored.size() == entries.count * 32768, label + "_size")
    }
    let roots = [root, URL(fileURLWithPath: root.path, isDirectory: true),
      URL(fileURLWithPath: root.lastPathComponent, isDirectory: true, relativeTo: root.deletingLastPathComponent())]
    for (index, representation) in roots.enumerated() {
      try verifyRestored(SongCacheStore(root: representation), entries: [first, second, track], label: "cold_\(index)")
    }
    print("PASS: cold cache lookup, listing and media bytes for three root URL representations")
    let firstFile = URL(string: first["url"] as! String)!, firstDirectory = firstFile.deletingLastPathComponent()
    func editEntry(_ directory: URL, _ update: (inout [String: Any]) throws -> Void) throws {
      let file = directory.appendingPathComponent("entry.json")
      var value = try JSONSerialization.jsonObject(with: Data(contentsOf: file)) as! [String: Any]
      try update(&value)
      try SongCacheStore.encode(value).write(to: file)
    }
    let corruptions: [(String, (URL, URL) throws -> URL)] = [
      ("wrong_namespace", { directory, _ in
        let parent = directory.deletingLastPathComponent().deletingLastPathComponent()
          .appendingPathComponent(String(repeating: "0", count: 64), isDirectory: true)
        try fm.createDirectory(at: parent, withIntermediateDirectories: true)
        let moved = parent.appendingPathComponent(directory.lastPathComponent, isDirectory: true)
        try fm.moveItem(at: directory, to: moved); return moved
      }),
      ("wrong_key", { directory, _ in
        let moved = directory.deletingLastPathComponent().appendingPathComponent(String(repeating: "0", count: 64), isDirectory: true)
        try fm.moveItem(at: directory, to: moved); return moved
      }),
      ("invalid_json", { directory, _ in
        try Data("{broken".utf8).write(to: directory.appendingPathComponent("entry.json")); return directory
      }),
      ("invalid_identity", { directory, _ in
        try editEntry(directory) { $0["key"] = try raw([ns, "0", "default", "original", "0", "revision", "mp3"]) }; return directory
      }),
      ("wrong_size", { directory, _ in
        try editEntry(directory) { $0["sizeBytes"] = 32769 }; return directory
      }),
      ("missing_media", { directory, file in
        try fm.removeItem(at: file); return directory
      }),
      ("truncated_media", { directory, file in
        try Data([109]).write(to: file); return directory
      })
    ]
    for (label, corrupt) in corruptions {
      let copy = fm.temporaryDirectory.appendingPathComponent("cache-invalid-\(label)-\(UUID().uuidString)", isDirectory: true)
      defer { try? fm.removeItem(at: copy) }
      try fm.copyItem(at: root, to: copy)
      let directory = copy.appendingPathComponent("v2", isDirectory: true)
        .appendingPathComponent(firstDirectory.deletingLastPathComponent().lastPathComponent, isDirectory: true)
        .appendingPathComponent(firstDirectory.lastPathComponent, isDirectory: true)
      let invalid = try corrupt(directory, directory.appendingPathComponent(firstFile.lastPathComponent))
      let restored = try SongCacheStore(root: copy)
      try check((try restored.getEntry(raw(["namespace": ns, "key": first["key"]!])))["cached"] as? Bool == false, label + "_lookup")
      try check(!fm.fileExists(atPath: invalid.path), label + "_cleanup")
      try verifyRestored(restored, entries: [second, track], label: label + "_survivors")
    }
    print("PASS: seven misplaced/corrupt cache entries removed without deleting valid identities")
    let legacy = root.appendingPathComponent("123.mp3"); try Data(repeating: 0, count: 4096).write(to: legacy)
    let limited = try cache(request("limited", track: "2", maximum: store.size() + 1024))
    try check(limited["error"] as? String == "limit_exceeded", "shared_total_limit")
    let unknown = try cache(request("unknown", track: "3", path: "/unknown", maximum: store.size() + 5000))
    try check(unknown["error"] as? String == "limit_exceeded", "streaming_unknown_limit")
    let hls = try cache(request("hls", track: "4", path: "/hls"))
    try check(hls["error"] as? String == "unsupported_media", "hls_rejected")
    let slow = try request("slow", track: "5", path: "/slow"), queued = try request("queued", track: "6", path: "/queued")
    let finished = DispatchSemaphore(value: 0), queuedFinished = DispatchSemaphore(value: 0)
    let started = DispatchSemaphore(value: 0), releaseCancel = DispatchSemaphore(value: 0), phaseLock = NSLock()
    var sawProgress = false
    var slowResult: [String: Any] = [:], queuedResult: [String: Any] = [:]
    store.cacheEntry(slow, progress: { value in
      if (value["bytes"] as? Int ?? 0) > 0 {
        phaseLock.lock(); let first = !sawProgress; sawProgress = true; phaseLock.unlock()
        if first { started.signal(); _ = releaseCancel.wait(timeout: .now() + 5); store.cancel("slow") }
      }
    }, callback: { slowResult = $0; finished.signal() })
    try check(started.wait(timeout: .now() + 10) == .success, "stream_not_started")
    store.cacheEntry(queued, progress: { _ in }, callback: { queuedResult = $0; queuedFinished.signal() })
    store.cancel("queued")
    releaseCancel.signal()
    try check(finished.wait(timeout: .now() + 15) == .success && queuedFinished.wait(timeout: .now() + 15) == .success, "cancel_deadline")
    try check(slowResult["error"] as? String == "cancelled" && queuedResult["error"] as? String == "cancelled", "real_cancel")
    let statsDone = DispatchSemaphore(value: 0); var stats: [String: Int] = [:]
    URLSession.shared.dataTask(with: URL(string: server + "/stats")!) { data, _, _ in
      if let data { stats = (try? JSONDecoder().decode([String: Int].self, from: data)) ?? [:] }; statsDone.signal()
    }.resume()
    try check(statsDone.wait(timeout: .now() + 10) == .success && stats["/queued"] == nil, "queued_opened_connection")
    try check((try fm.contentsOfDirectory(atPath: root.appendingPathComponent("staging").path)).isEmpty, "temporary_cleanup")
    let cleared = try awaitCallback { store.clearNamespace(ns, callback: $0) }
    try check(cleared["error"] == nil, "clear_namespace")
    try check((try store.listEntries(raw(["namespace": other])))["total"] as? Int == 1 && fm.fileExists(atPath: legacy.path), "clear_crossed_identity")
    _ = try awaitCallback { store.clearLegacy($0) }
    try check(!fm.fileExists(atPath: legacy.path) && store.size() == 32768, "legacy_cleanup")
    let partial = root.appendingPathComponent("staging/orphan"); try fm.createDirectory(at: partial, withIntermediateDirectories: true)
    let unfinished = root.appendingPathComponent("tasks/restart.json")
    try SongCacheStore.encode(["task_id": "restart", "namespace": other, "key": second["key"]!, "status": "downloading", "bytes": 1024, "total": 4096]).write(to: unfinished)
    try fm.removeItem(at: URL(string: second["url"] as! String)!)
    let restarted = try SongCacheStore(root: root)
    let history = restarted.getTasks()["tasks"] as? [[String: Any]] ?? []
    try check(history.first(where: { $0["task_id"] as? String == "restart" })?["status"] as? String == "interrupted", "restart_status")
    try check((try restarted.listEntries(raw(["namespace": other])))["total"] as? Int == 0 && !fm.fileExists(atPath: partial.path), "restart_partial_file")
    print("PASS: real Apple Foundation/CryptoKit cache identity, files, MIME, capacity, streaming/queued cancellation, cleanup and restart")
  }
}
