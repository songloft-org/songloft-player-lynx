import Foundation

/// E2E test bridge native module — the iOS counterpart of
/// `org.songloft.lynx.test.SongloftTestBridgeModule`.
///
/// Registered as `SongloftTestBridge` on the LynxConfig. The TCP server
/// (`TestBridgeServer`) calls `evaluateJS(_:id:)` which fires a GlobalEvent
/// `TestBridge.eval` to the BTS, where `e2e-bridge.ts` evaluates the expression
/// and calls back via `respond(id, resultJson)` / `respondError(id, errorMsg)`.
final class SongloftTestBridgeModule: NSObject, LynxContextModule {

  @objc static var name: String { "SongloftTestBridge" }

  @objc static var methodLookup: [String: String] {
    [
      "respond": NSStringFromSelector(#selector(SongloftTestBridgeModule.respond(_:result:))),
      "respondError": NSStringFromSelector(#selector(SongloftTestBridgeModule.respondError(_:error:))),
    ]
  }

  private weak var context: LynxContext?

  private struct PendingEval {
    let continuation: CheckedContinuation<String?, Error>
  }

  private let lock = NSLock()
  private var pendingEvals: [Int: DispatchSemaphore] = [:]
  private var results: [Int: String?] = [:]
  private var errors: [Int: String?] = [:]

  static weak var shared: SongloftTestBridgeModule?

  private init(context: LynxContext?) {
    self.context = context
    super.init()
    SongloftTestBridgeModule.shared = self
    NSLog("[TestBridge] SongloftTestBridgeModule initialized")
  }

  @objc(initWithLynxContext:)
  convenience init(lynxContext context: LynxContext) {
    self.init(context: context)
  }

  @objc(initWithLynxContext:WithParam:)
  convenience init(lynxContext context: LynxContext, withParam param: Any) {
    self.init(context: context)
  }

  @objc(initWithParam:)
  convenience init(param: Any) {
    self.init(context: nil)
  }

  @objc override convenience init() {
    self.init(context: nil)
  }

  // MARK: - JS Callbacks

  @objc func respond(_ id: Int, result: String?) {
    lock.lock()
    results[id] = result
    let sem = pendingEvals[id]
    lock.unlock()
    sem?.signal()
  }

  @objc func respondError(_ id: Int, error: String?) {
    lock.lock()
    errors[id] = error ?? "unknown error"
    let sem = pendingEvals[id]
    lock.unlock()
    sem?.signal()
  }

  // MARK: - Evaluate from TCP server

  func evaluateJS(id: Int, expression: String) -> (result: String?, error: String?) {
    guard let ctx = context else {
      return (nil, "no LynxContext")
    }

    let sem = DispatchSemaphore(value: 0)
    lock.lock()
    pendingEvals[id] = sem
    lock.unlock()

    let payload: [String: Any] = ["id": id, "expr": expression]
    DispatchQueue.main.async {
      ctx.sendGlobalEvent("TestBridge.eval", withParams: [payload])
    }

    let waitResult = sem.wait(timeout: .now() + 15)

    lock.lock()
    pendingEvals.removeValue(forKey: id)
    let result = results.removeValue(forKey: id) ?? nil
    let error = errors.removeValue(forKey: id) ?? nil
    lock.unlock()

    if waitResult == .timedOut {
      return (nil, "eval timeout (15s)")
    }
    if let error = error {
      return (nil, error)
    }
    return (result, nil)
  }
}
