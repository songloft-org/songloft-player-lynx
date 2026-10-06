import Foundation

/// Runs in the Apple CI job with the real Security/CryptoKit/file implementation.
@main
struct VerifyIOSUpdater {
  static func check(_ value: Bool, _ message: String = "native_update_check_failed") throws {
    if !value { throw BundleUpdateStore.Failure(code: message) }
  }
  static func main() throws {
    let input = try Data(contentsOf: URL(fileURLWithPath: CommandLine.arguments[1]))
    guard let vector = try JSONSerialization.jsonObject(with: input) as? [String: Any],
      let raw = vector["raw_manifest"] as? String, let host = vector["native_host"] as? [String: Any],
      let envelope = vector["envelope"], let payload = vector["bundle_base64"] as? String,
      let bytes = Data(base64Encoded: payload),
      let manifest = try JSONSerialization.jsonObject(with: Data(raw.utf8)) as? [String: Any],
      let bundle = manifest["bundle_update"] as? [String: Any],
      let sha = bundle["sha256"] as? String, let id = bundle["bundle_id"] as? String else {
      throw BundleUpdateStore.Failure(code: "invalid_test_vector")
    }
    let metadata = try JSONSerialization.data(withJSONObject: host)
    let signatureData = try JSONSerialization.data(withJSONObject: envelope)
    let signature = String(decoding: signatureData, as: UTF8.self)
    let root = FileManager.default.temporaryDirectory.appendingPathComponent("lynx-apple-update-\(UUID().uuidString)", isDirectory: true)
    defer { try? FileManager.default.removeItem(at: root) }
    let store = try BundleUpdateStore(root: root, metadata: metadata)
    _ = try store.beginLaunch()
    _ = try store.inspect(raw, signature: signature)
    do {
      _ = try store.inspect(raw + " ", signature: signature)
      throw BundleUpdateStore.Failure(code: "test_accepted_tampering")
    } catch let error as BundleUpdateStore.Failure where error.code == "invalid_signature" {}
    func rejectsHost(_ identity: [String: Any], code: String) throws {
      let isolated = root.appendingPathComponent("rejected-\(code)")
      let other = try BundleUpdateStore(root: isolated, metadata: JSONSerialization.data(withJSONObject: identity))
      do {
        _ = try other.inspect(raw, signature: signature)
        throw BundleUpdateStore.Failure(code: "test_accepted_incompatible_host")
      } catch let error as BundleUpdateStore.Failure where error.code == code {}
    }
    var different = host
    different["trusted_keys"] = []
    try rejectsHost(different, code: "unknown_signing_key")
    different = host; different["channel"] = "stable"
    try rejectsHost(different, code: "incompatible_channel")
    different = host; different["engines"] = ["ios": "9.0.0"]
    try rejectsHost(different, code: "incompatible_engine")
    different = host; different["bridge_version"] = 99
    try rejectsHost(different, code: "incompatible_bridge")
    different = host; different["capabilities"] = []
    try rejectsHost(different, code: "incompatible_capability")
    different = host; different["local_schema"] = 99
    try rejectsHost(different, code: "incompatible_schema")
    let key = sha + "-" + id
    let directory = root.appendingPathComponent("bundles/\(key)", isDirectory: true)
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    try Data(raw.utf8).write(to: directory.appendingPathComponent("version.json"))
    try signatureData.write(to: directory.appendingPathComponent("version.json.sig"))
    try bytes.write(to: directory.appendingPathComponent("main.lynx.bundle"))
    func pending() throws {
      let file = root.appendingPathComponent("state.json")
      var state = try JSONDecoder().decode([String: String].self, from: Data(contentsOf: file))
      state["pending"] = key
      try JSONEncoder().encode(state).write(to: file, options: .atomic)
    }
    try pending()
    let trial = try BundleUpdateStore(root: root, metadata: metadata)
    try check(trial.beginLaunch() == bytes, "Trial must load verified bytes")
    let trialInfo = try trial.info()
    try check((trialInfo["running"] as? [String: Any])?["kind"] as? String == "trial")
    try trial.confirmStartup("another-bundle")
    try check((trial.info()["running"] as? [String: Any])?["kind"] as? String == "trial")
    // An unconfirmed launch is never retried, even with a valid signature.
    let rollback = try BundleUpdateStore(root: root, metadata: metadata)
    try check(rollback.beginLaunch() == nil)
    try check(rollback.info()["last_error"] as? String == "rollback_unconfirmed")
    // Recreate the candidate removed by rollback pruning; successful confirmation persists.
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    try Data(raw.utf8).write(to: directory.appendingPathComponent("version.json"))
    try signatureData.write(to: directory.appendingPathComponent("version.json.sig"))
    try bytes.write(to: directory.appendingPathComponent("main.lynx.bundle"))
    try pending()
    let confirmed = try BundleUpdateStore(root: root, metadata: metadata)
    try check(confirmed.beginLaunch() == bytes)
    try confirmed.confirmStartup(id)
    let active = try BundleUpdateStore(root: root, metadata: metadata)
    try check(active.beginLaunch() == bytes)
    try check((active.info()["running"] as? [String: Any])?["kind"] as? String == "active")
    try active.restoreBuiltin()
    try check(active.beginLaunch() == bytes, "Restore must preserve the running template")
    try check(BundleUpdateStore(root: root, metadata: metadata).beginLaunch() == nil)
    // Restore pruned the candidate on cold start; recreate it to test disk corruption.
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    try Data(raw.utf8).write(to: directory.appendingPathComponent("version.json"))
    try signatureData.write(to: directory.appendingPathComponent("version.json.sig"))
    try bytes.write(to: directory.appendingPathComponent("main.lynx.bundle"))
    try pending()
    try Data(bytes.map { $0 ^ 1 }).write(to: directory.appendingPathComponent("main.lynx.bundle"))
    let corrupted = try BundleUpdateStore(root: root, metadata: metadata)
    try check(corrupted.beginLaunch() == nil)
    print("Apple updater: original UTF-8 signature, compatibility, trial rollback, confirmation, restore, and disk hash checks passed")
  }
}
