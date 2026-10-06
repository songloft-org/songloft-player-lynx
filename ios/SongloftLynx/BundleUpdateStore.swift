import Foundation
import CryptoKit
import Security

/// Immutable shell verification and disk state. The module and root loader share one instance.
final class BundleUpdateStore {
  static let shared: BundleUpdateStore? = try? BundleUpdateStore()
  static let maximumBundle = 32 * 1024 * 1024
  static let maximumManifest = 128 * 1024

  struct Failure: Error { let code: String }
  struct SignatureEnvelope: Decodable {
    let `protocol`: Int
    let key_id: String
    let algorithm: String
    let signature: String
  }
  struct PublicKey: Decodable {
    let key_id: String
    let key_bits: Int
    let algorithm: String
    let pkcs1_base64: String
  }
  struct Asset: Decodable { let name: String; let size: Int; let sha256: String }
  struct Target: Decodable {
    let platform: String
    let engine: String
    let minimum_host_version: String
    let minimum_bridge: Int
    let maximum_bridge: Int
    let required_capabilities: [String]
  }
  struct BundleUpdate: Decodable {
    let `protocol`: Int
    let bundle_id: String
    let asset: String
    let size: Int
    let sha256: String
    let local_schema: Int
    let targets: [Target]
  }
  struct Manifest: Decodable {
    let version: String
    let package_version: String
    let native_version: String
    let build_number: Int
    let git_commit: String
    let build_time: String
    let channel: String
    let release_tag: String
    let assets: [Asset]
    let bundle_update: BundleUpdate
  }
  struct Request: Decodable {
    let task_id: String
    let manifest: String
    let signature: String
    let url: String
  }
  private struct Record {
    let manifest: Manifest
    let raw: Data
    let key: String
    let file: URL
  }

  private let fileManager = FileManager.default
  private let root: URL
  private let bundles: URL
  private let host: [String: Any]
  private let keys: [PublicKey]
  private let marker: String
  private let lock = NSRecursiveLock()
  private var state: [String: String]
  private var persistedState: [String: String]
  private var launchStarted = false
  private var selected: Record?
  private var trialStarted = 0.0
  private var startupFailed = false
  private var inflight: BundleUpdateTransfer?
  private var cancelledTasks: [String] = []

  private convenience init() throws {
    guard let resource = Bundle.main.url(forResource: "native-host", withExtension: "json") else {
      throw Failure(code: "update_unavailable")
    }
    let root = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
      .appendingPathComponent("bundle_updates", isDirectory: true)
    try self.init(root: root, metadata: Data(contentsOf: resource))
  }

  /// Native-only injection for the macOS/Apple crypto regression harness; never exposed to JS.
  init(root: URL, metadata: Data) throws {
    var identity = try Self.object(metadata)
    identity["platform"] = "ios"
    host = identity
    keys = try JSONDecoder().decode([PublicKey].self,
      from: JSONSerialization.data(withJSONObject: identity["trusted_keys"] ?? []))
    let hostMarker = Self.hash(try JSONSerialization.data(withJSONObject: identity, options: [.sortedKeys]))
    marker = hostMarker
    self.root = root
    let bundleDirectory = root.appendingPathComponent("bundles", isDirectory: true)
    bundles = bundleDirectory
    try FileManager.default.createDirectory(at: bundleDirectory, withIntermediateDirectories: true)
    var values: URLResourceValues = URLResourceValues()
    values.isExcludedFromBackup = true
    var mutableRoot = root
    try mutableRoot.setResourceValues(values)
    let snapshot = (try? Self.boundedData(root.appendingPathComponent("state.json"), maximum: 16_384))
      .flatMap { try? JSONDecoder().decode([String: String].self, from: $0) } ?? ["host": hostMarker]
    state = snapshot
    persistedState = snapshot
    for entry in (try? FileManager.default.contentsOfDirectory(at: root, includingPropertiesForKeys: nil)) ?? [] {
      if entry.lastPathComponent.hasPrefix("download-") { try? fileManager.removeItem(at: entry) }
    }
  }

  private func locked<T>(_ action: () throws -> T) rethrows -> T {
    lock.lock(); defer { lock.unlock() }
    return try action()
  }
  private static func object(_ data: Data) throws -> [String: Any] {
    guard let value = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
      throw Failure(code: "invalid_manifest")
    }
    return value
  }
  private static func matches(_ value: String, _ pattern: String) -> Bool {
    value.range(of: pattern, options: .regularExpression) != nil
  }
  private static func version(_ value: String) -> [Int]? {
    guard matches(value, "^(0|[1-9][0-9]{0,8})\\.(0|[1-9][0-9]{0,8})\\.(0|[1-9][0-9]{0,8})$") else { return nil }
    return value.split(separator: ".").compactMap { Int($0) }
  }
  private static func compare(_ a: String, _ b: String) throws -> Int {
    guard let left = version(a), let right = version(b) else { throw Failure(code: "invalid_manifest") }
    for index in 0..<3 { if left[index] != right[index] { return left[index] > right[index] ? 1 : -1 } }
    return 0
  }
  private static func hash(_ data: Data) -> String {
    SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
  }
  private static func boundedData(_ file: URL, maximum: Int) throws -> Data {
    let size = try file.resourceValues(forKeys: [.fileSizeKey, .isRegularFileKey])
    guard size.isRegularFile == true, let count = size.fileSize, count > 0, count <= maximum else {
      throw Failure(code: "invalid_manifest")
    }
    let data = try Data(contentsOf: file)
    guard data.count == count else { throw Failure(code: "checksum_mismatch") }
    return data
  }
  private static func fileHash(_ file: URL) throws -> String {
    let input = try FileHandle(forReadingFrom: file)
    defer { try? input.close() }
    var digest = SHA256()
    while let data = try input.read(upToCount: 64 * 1024), !data.isEmpty { digest.update(data: data) }
    return digest.finalize().map { String(format: "%02x", $0) }.joined()
  }
  private static func time(_ value: String) -> Date? {
    guard matches(value, "^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\\.[0-9]{3}Z$") else { return nil }
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return formatter.date(from: value)
  }
  private func text(_ key: String) -> String { host[key] as? String ?? "" }
  private func number(_ key: String) -> Int { host[key] as? Int ?? -1 }

  func hostInfo() -> [String: Any] {
    var result = host
    result["engine"] = (host["engines"] as? [String: String])?["ios"]
    result["trusted_key_ids"] = keys.map { $0.key_id }
    result.removeValue(forKey: "engines"); result.removeValue(forKey: "trusted_keys")
    return result
  }

  func inspect(_ raw: String, signature: String) throws -> [String: Any] {
    let data = Data(raw.utf8)
    _ = try verify(data, signature: Data(signature.utf8))
    return try Self.object(data)
  }
  private func verify(_ data: Data, signature envelopeData: Data) throws -> Manifest {
    guard !data.isEmpty, data.count <= Self.maximumManifest, envelopeData.count <= 8192 else {
      throw Failure(code: "invalid_manifest")
    }
    let envelope = try JSONDecoder().decode(SignatureEnvelope.self, from: envelopeData)
    guard envelope.protocol == 1, envelope.algorithm == "rsa-pkcs1v15-sha256" else { throw Failure(code: "invalid_signature") }
    guard let trusted = keys.first(where: { $0.key_id == envelope.key_id }) else { throw Failure(code: "unknown_signing_key") }
    guard trusted.algorithm == envelope.algorithm, [2048, 3072, 4096].contains(trusted.key_bits),
      let keyBytes = Data(base64Encoded: trusted.pkcs1_base64),
      let signature = Data(base64Encoded: envelope.signature), signature.base64EncodedString() == envelope.signature else {
      throw Failure(code: "invalid_signature")
    }
    let attributes: [String: Any] = [kSecAttrKeyType as String: kSecAttrKeyTypeRSA,
      kSecAttrKeyClass as String: kSecAttrKeyClassPublic, kSecAttrKeySizeInBits as String: trusted.key_bits]
    var error: Unmanaged<CFError>?
    guard let key = SecKeyCreateWithData(keyBytes as CFData, attributes as CFDictionary, &error),
      let actual = SecKeyCopyAttributes(key) as? [String: Any],
      (actual[kSecAttrKeySizeInBits as String] as? Int) == trusted.key_bits,
      SecKeyVerifySignature(key, .rsaSignatureMessagePKCS1v15SHA256, data as CFData, signature as CFData, &error) else {
      throw Failure(code: "invalid_signature")
    }
    let manifest = try JSONDecoder().decode(Manifest.self, from: data)
    try compatible(manifest)
    return manifest
  }
  private func compatible(_ manifest: Manifest) throws {
    guard ["dev", "stable"].contains(text("channel")), manifest.channel == text("channel") else { throw Failure(code: "incompatible_channel") }
    guard (1...2_100_000_000).contains(manifest.build_number), Self.version(manifest.native_version) != nil,
      (manifest.channel == "dev" ? manifest.version == "dev" && manifest.release_tag == "dev"
        : Self.version(manifest.version) != nil && manifest.release_tag == "v\(manifest.version)") else {
      throw Failure(code: "invalid_manifest")
    }
    let bundle = manifest.bundle_update
    guard bundle.protocol == 1, number("update_protocol") == 1 else { throw Failure(code: "incompatible_protocol") }
    guard bundle.local_schema == number("local_schema") else { throw Failure(code: "incompatible_schema") }
    guard Self.matches(bundle.bundle_id, "^[A-Za-z0-9._-]{1,96}$"),
      bundle.bundle_id == "\(manifest.channel)-\(manifest.build_number)-\(manifest.git_commit)",
      bundle.asset == "songloft-lynx-main.lynx.bundle", (1...Self.maximumBundle).contains(bundle.size),
      Self.matches(bundle.sha256, "^[0-9a-f]{64}$"), (1...16).contains(manifest.assets.count) else {
      throw Failure(code: "invalid_manifest")
    }
    var names = Set<String>()
    for asset in manifest.assets {
      guard Self.matches(asset.name, "^[A-Za-z0-9._-]+$"), ![".", ".."].contains(asset.name),
        names.insert(asset.name).inserted, asset.size > 0, Self.matches(asset.sha256, "^[0-9a-f]{64}$") else { throw Failure(code: "invalid_manifest") }
    }
    guard let listed = manifest.assets.first(where: { $0.name == bundle.asset }), listed.size == bundle.size,
      listed.sha256 == bundle.sha256, (1...3).contains(bundle.targets.count) else { throw Failure(code: "invalid_manifest") }
    var platforms = Set<String>()
    for target in bundle.targets {
      guard ["android", "ios", "harmony"].contains(target.platform), platforms.insert(target.platform).inserted,
        Self.version(target.engine) != nil, Self.version(target.minimum_host_version) != nil,
        target.minimum_bridge >= 0, target.maximum_bridge >= target.minimum_bridge, target.required_capabilities.count <= 64,
        Set(target.required_capabilities).count == target.required_capabilities.count,
        target.required_capabilities.allSatisfy({ !$0.isEmpty && $0.utf8.count <= 1024 }) else { throw Failure(code: "invalid_manifest") }
    }
    guard let target = bundle.targets.first(where: { $0.platform == "ios" }) else { throw Failure(code: "incompatible_platform") }
    guard target.engine == (host["engines"] as? [String: String])?["ios"] else { throw Failure(code: "incompatible_engine") }
    guard try Self.compare(text("native_version"), target.minimum_host_version) >= 0 else { throw Failure(code: "incompatible_host") }
    guard (target.minimum_bridge...target.maximum_bridge).contains(number("bridge_version")) else { throw Failure(code: "incompatible_bridge") }
    let available = Set(host["capabilities"] as? [String] ?? [])
    guard target.required_capabilities.allSatisfy({ available.contains($0) }) else { throw Failure(code: "incompatible_capability") }
  }

  private func keyOf(_ manifest: Manifest) -> String { "\(manifest.bundle_update.sha256)-\(manifest.bundle_update.bundle_id)" }
  private func readRecord(_ key: String?) -> Record? {
    guard let key, Self.matches(key, "^[0-9a-f]{64}-[A-Za-z0-9._-]{1,96}$") else { return nil }
    do {
      let directory = bundles.appendingPathComponent(key, isDirectory: true)
      let raw = try Self.boundedData(directory.appendingPathComponent("version.json"), maximum: Self.maximumManifest)
      let signature = try Self.boundedData(directory.appendingPathComponent("version.json.sig"), maximum: 8192)
      let manifest = try verify(raw, signature: signature)
      let file = directory.appendingPathComponent("main.lynx.bundle")
      let values = try file.resourceValues(forKeys: [.fileSizeKey, .isRegularFileKey])
      guard keyOf(manifest) == key, values.isRegularFile == true, values.fileSize == manifest.bundle_update.size,
        try Self.fileHash(file) == manifest.bundle_update.sha256 else { return nil }
      return Record(manifest: manifest, raw: raw, key: key, file: file)
    } catch { return nil }
  }
  private func saveState() throws {
    do {
      try Self.writeAtomically(JSONEncoder().encode(state), to: root.appendingPathComponent("state.json"))
      persistedState = state
    } catch { state = persistedState; throw Failure(code: "update_storage_unavailable") }
  }
  private static func writeAtomically(_ data: Data, to file: URL) throws {
    let temporary = file.deletingLastPathComponent().appendingPathComponent("write-\(UUID().uuidString)")
    defer { try? FileManager.default.removeItem(at: temporary) }
    try data.write(to: temporary)
    let handle = try FileHandle(forWritingTo: temporary)
    do { try handle.synchronize(); try handle.close() }
    catch { try? handle.close(); throw error }
    if FileManager.default.fileExists(atPath: file.path) {
      _ = try FileManager.default.replaceItemAt(file, withItemAt: temporary)
    } else {
      try FileManager.default.moveItem(at: temporary, to: file)
    }
  }
  private func prune() {
    var keep = Set(["active", "previous", "pending", "trial"].compactMap { state[$0] })
    if let selected { keep.insert(selected.key) }
    for entry in (try? fileManager.contentsOfDirectory(at: bundles, includingPropertiesForKeys: nil)) ?? [] {
      if Self.matches(entry.lastPathComponent, "^[0-9a-f]{64}-[A-Za-z0-9._-]{1,96}$"), !keep.contains(entry.lastPathComponent) {
        try? fileManager.removeItem(at: entry)
      }
    }
  }
  private func newerThanInstalled(_ record: Record) -> Bool {
    if text("channel") == "stable" { return (try? Self.compare(record.manifest.version, text("version"))) == 1 }
    guard let candidate = Self.time(record.manifest.build_time), let installed = Self.time(text("build_time")) else { return false }
    return candidate > installed
  }
  func beginLaunch() throws -> Data? {
    try locked {
      if launchStarted { return try selected.map { try Data(contentsOf: $0.file) } }
      launchStarted = true
      let changed = state["host"] != marker
      if state["trial"] != nil {
        state.removeValue(forKey: "trial"); state.removeValue(forKey: "pending"); state["last_error"] = "rollback_unconfirmed"
      }
      for field in ["active", "previous", "pending"] {
        if let record = readRecord(state[field]), !changed || newerThanInstalled(record) {} else { state.removeValue(forKey: field) }
      }
      state["host"] = marker
      if let pending = readRecord(state["pending"]) {
        selected = pending; state["trial"] = pending.key; state.removeValue(forKey: "pending")
        trialStarted = ProcessInfo.processInfo.systemUptime
      } else {
        selected = readRecord(state["active"]) ?? readRecord(state["previous"])
        if let selected { state["active"] = selected.key }
      }
      do {
        try saveState()
        let data = try selected.map { try Data(contentsOf: $0.file) }
        prune()
        return data
      } catch { selected = nil; startupFailed = true; try? failStartup(); throw error }
    }
  }
  func confirmStartup(_ id: String) throws {
    try locked {
      guard let selected, !startupFailed, state["trial"] == selected.key, selected.manifest.bundle_update.bundle_id == id else { return }
      guard ProcessInfo.processInfo.systemUptime - trialStarted <= 120 else { try failStartup(); return }
      if let active = state["active"], active != selected.key { state["previous"] = active }
      state["active"] = selected.key; state.removeValue(forKey: "trial"); state.removeValue(forKey: "last_error")
      try saveState()
    }
  }
  func failStartup() throws {
    try locked { if state["trial"] != nil { startupFailed = true; state["last_error"] = "startup_failed"; try saveState() } }
  }
  func restoreBuiltin() throws {
    try locked {
      if let inflight { cancel(inflight.id) }
      for field in ["active", "previous", "pending", "trial"] { state.removeValue(forKey: field) }
      state["last_error"] = "restore_builtin"
      try saveState()
    }
  }
  func info() throws -> [String: Any] {
    try locked {
      var result: [String: Any] = ["host": hostInfo()]
      var running = try selected.map { try Self.object($0.raw) } ?? hostInfo()
      running["kind"] = selected == nil ? "builtin" : (state["trial"] == selected?.key ? "trial" : "active")
      result["running"] = running
      for field in ["active", "previous", "pending"] {
        if let record = readRecord(state[field]) { result[field] = try Self.object(record.raw) }
        else { result[field] = NSNull() }
      }
      if let error = state["last_error"] { result["last_error"] = error }
      if let inflight { result["download"] = ["task_id": inflight.id, "bytes": inflight.bytes, "total": inflight.total] }
      return result
    }
  }
  func cancel(_ id: String) {
    locked {
      if let inflight, inflight.id == id { inflight.cancel() }
      else if !id.isEmpty { cancelledTasks.append(id); if cancelledTasks.count > 64 { cancelledTasks.removeFirst() } }
    }
  }
  private func checkNewUpdate(_ manifest: Manifest) throws {
    let currentVersion = selected?.manifest.version ?? text("version")
    if text("channel") == "stable" {
      guard try Self.compare(manifest.version, currentVersion) > 0,
        try Self.compare(manifest.version, text("version")) > 0 else { throw Failure(code: "update_not_newer") }
    } else {
      let previous = selected?.manifest.git_commit ?? text("git_commit")
      if Self.matches(previous, "^[0-9a-f]{7,40}$"), Self.matches(manifest.git_commit, "^[0-9a-f]{7,40}$") {
        guard manifest.git_commit != previous else { throw Failure(code: "update_not_newer") }
      } else {
        guard let next = Self.time(manifest.build_time), let last = Self.time(selected?.manifest.build_time ?? text("build_time")),
          next.timeIntervalSince(last) >= 600 else { throw Failure(code: "update_not_newer") }
      }
    }
  }

  func prepare(_ request: Request, progress: @escaping (Int, Int) -> Void,
    completion: @escaping (Result<[String: Any], Error>) -> Void) throws {
    let raw = Data(request.manifest.utf8), signature = Data(request.signature.utf8)
    let manifest = try verify(raw, signature: signature)
    guard Self.matches(request.task_id, "^[A-Za-z0-9-]{1,96}$"), let remote = URL(string: request.url),
      BundleUpdateTransfer.validURL(remote) else { throw Failure(code: "invalid_update_url") }
    try locked {
      try checkNewUpdate(manifest)
      if cancelledTasks.contains(request.task_id) { cancelledTasks.removeAll { $0 == request.task_id }; throw Failure(code: "cancelled") }
      guard inflight == nil else { throw Failure(code: "update_busy") }
      let space = try fileManager.attributesOfFileSystem(forPath: root.path)[.systemFreeSize] as? NSNumber
      guard let space, space.int64Value >= Int64(manifest.bundle_update.size + 512 * 1024) else { throw Failure(code: "insufficient_space") }
      let directory = root.appendingPathComponent("download-\(request.task_id)", isDirectory: true)
      try fileManager.createDirectory(at: directory, withIntermediateDirectories: false)
      let file = directory.appendingPathComponent("main.lynx.bundle")
      do {
        let transfer = try BundleUpdateTransfer(id: request.task_id, url: remote, file: file,
          total: manifest.bundle_update.size, progress: progress) { [weak self] outcome in
          guard let self else { return }
          let result: Result<[String: Any], Error> = Result {
            try self.locked {
              try outcome.get()
              guard self.inflight?.cancelled != true else { throw Failure(code: "cancelled") }
              guard try Self.fileHash(file) == manifest.bundle_update.sha256 else { throw Failure(code: "checksum_mismatch") }
              try Self.writeAtomically(raw, to: directory.appendingPathComponent("version.json"))
              try Self.writeAtomically(signature, to: directory.appendingPathComponent("version.json.sig"))
              let key = self.keyOf(manifest), destination = self.bundles.appendingPathComponent(key, isDirectory: true)
              if self.readRecord(key) == nil {
                if self.fileManager.fileExists(atPath: destination.path) { try self.fileManager.removeItem(at: destination) }
                try self.fileManager.moveItem(at: directory, to: destination)
              }
              self.state["pending"] = key
              try self.saveState(); self.prune()
              return ["prepared": true, "bundle_id": manifest.bundle_update.bundle_id]
            }
          }
          try? self.fileManager.removeItem(at: directory)
          self.locked { if self.inflight?.id == request.task_id { self.inflight = nil } }
          completion(result)
        }
        inflight = transfer
        transfer.start()
      } catch { try? fileManager.removeItem(at: directory); throw error }
    }
  }
}
