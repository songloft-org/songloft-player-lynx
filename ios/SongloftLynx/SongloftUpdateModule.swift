import Foundation

final class SongloftUpdateModule: NSObject, LynxContextModule {
  private weak var context: LynxContext?
  private static let commands = DispatchQueue(label: "org.songloft.updates.commands")
  private static let downloads = DispatchQueue(label: "org.songloft.updates.downloads")
  @objc static var name: String { "SongloftUpdate" }
  @objc static var methodLookup: [String: String] {
    [
      "getInfo": NSStringFromSelector(#selector(SongloftUpdateModule.getInfo(_:))),
      "getState": NSStringFromSelector(#selector(SongloftUpdateModule.getState(_:))),
      "fetchMetadata": NSStringFromSelector(#selector(SongloftUpdateModule.fetchMetadata(_:callback:))),
      "inspectManifest": NSStringFromSelector(#selector(SongloftUpdateModule.inspectManifest(_:signature:callback:))),
      "download": NSStringFromSelector(#selector(SongloftUpdateModule.download(_:callback:))),
      "cancel": NSStringFromSelector(#selector(SongloftUpdateModule.cancel(_:))),
      "confirmStartup": NSStringFromSelector(#selector(SongloftUpdateModule.confirmStartup(_:))),
      "reportStartupFailure": NSStringFromSelector(#selector(SongloftUpdateModule.reportStartupFailure)),
      "restoreBuiltin": NSStringFromSelector(#selector(SongloftUpdateModule.restoreBuiltin(_:))),
    ]
  }
  @objc(initWithParam:)
  convenience init(param: Any) { self.init(context: nil) }
  @objc(initWithLynxContext:)
  convenience init(lynxContext context: LynxContext) { self.init(context: context) }
  @objc(initWithLynxContext:WithParam:)
  convenience init(lynxContext context: LynxContext, withParam param: Any) { self.init(context: context) }
  override init() { super.init() }
  private init(context: LynxContext?) { self.context = context; super.init() }

  private static func store() throws -> BundleUpdateStore {
    guard let store = BundleUpdateStore.shared else { throw BundleUpdateStore.Failure(code: "update_unavailable") }
    return store
  }
  private static func reply(_ callback: (String) -> Void, _ result: Result<[String: Any], Error>) {
    let response: [String: Any]
    switch result {
    case .success(let value): response = value
    case .failure(let error): response = ["error": (error as? BundleUpdateStore.Failure)?.code ?? "update_failed"]
    }
    // Only machine errors cross the bridge; URLSession/IO messages can contain private URLs.
    guard let data = try? JSONSerialization.data(withJSONObject: response), let json = String(data: data, encoding: .utf8) else {
      callback("{\"error\":\"update_failed\"}"); return
    }
    callback(json)
  }
  @objc func getInfo(_ callback: @escaping (String) -> Void) {
    Self.commands.async { Self.reply(callback, Result { try Self.store().hostInfo() }) }
  }
  @objc func getState(_ callback: @escaping (String) -> Void) {
    Self.commands.async { Self.reply(callback, Result { try Self.store().info() }) }
  }
  @objc func fetchMetadata(_ requestJSON: String, callback: @escaping (String) -> Void) {
    do { try UpdateMetadata.fetch(requestJSON) { result in Self.reply(callback, result) } }
    catch { Self.reply(callback, .failure(error)) }
  }
  @objc func inspectManifest(_ raw: String, signature: String, callback: @escaping (String) -> Void) {
    Self.commands.async { Self.reply(callback, Result { try Self.store().inspect(raw, signature: signature) }) }
  }
  @objc func download(_ requestJSON: String, callback: @escaping (String) -> Void) {
    Self.downloads.async { [weak self] in
      do {
        let request = try JSONDecoder().decode(BundleUpdateStore.Request.self, from: Data(requestJSON.utf8))
        try Self.store().prepare(request, progress: { [weak self] bytes, total in
          DispatchQueue.main.async { [weak self] in
            self?.context?.sendGlobalEvent("SongloftUpdate.progress", withParams: [["task_id": request.task_id, "bytes": bytes, "total": total]])
          }
        }, completion: { result in Self.reply(callback, result) })
      } catch { Self.reply(callback, .failure(error)) }
    }
  }
  @objc func cancel(_ taskId: String) { BundleUpdateStore.shared?.cancel(taskId) }
  @objc func confirmStartup(_ bundleId: String) { Self.commands.async { try? Self.store().confirmStartup(bundleId) } }
  @objc func reportStartupFailure() { Self.commands.async { try? Self.store().failStartup() } }
  @objc func restoreBuiltin(_ callback: @escaping (String) -> Void) {
    Self.commands.async { Self.reply(callback, Result { try Self.store().restoreBuiltin(); return [:] }) }
  }
}
