import Foundation

final class SongloftPluginBridgeModule: NSObject, LynxContextModule {
  @objc static var name: String { "SongloftPluginBridge" }

  @objc static var methodLookup: [String: String] {
    [
      "registerHost": NSStringFromSelector(#selector(SongloftPluginBridgeModule.registerHost(_:))),
      "unregisterHost": NSStringFromSelector(#selector(SongloftPluginBridgeModule.unregisterHost(_:))),
      "registerChild": NSStringFromSelector(#selector(SongloftPluginBridgeModule.registerChild(_:))),
      "hostCall": NSStringFromSelector(#selector(SongloftPluginBridgeModule.hostCall(_:callId:ns:method:paramsJson:))),
      "hostReply": NSStringFromSelector(#selector(SongloftPluginBridgeModule.hostReply(_:callId:resultJson:))),
      "pushToChild": NSStringFromSelector(#selector(SongloftPluginBridgeModule.pushToChild(_:eventName:dataJson:))),
    ]
  }

  private static let lock = NSLock()
  private static var hostRegistry: [String: LynxContext] = [:]
  private static var childRegistry: [String: LynxContext] = [:]

  private static let EVENT_HOST_CALL = "SongloftPluginBridge.hostCall"
  private static let EVENT_HOST_REPLY = "SongloftPluginBridge.hostReply"
  private static let EVENT_PUSH = "SongloftPluginBridge.push"

  private weak var context: LynxContext?

  private init(context: LynxContext?) {
    self.context = context
    super.init()
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

  override convenience init() {
    self.init(context: nil)
  }

  // MARK: - Parent side

  @objc func registerHost(_ frameId: String) {
    guard let ctx = context else { return }
    Self.lock.lock()
    Self.hostRegistry[frameId] = ctx
    Self.lock.unlock()
  }

  @objc func unregisterHost(_ frameId: String) {
    Self.lock.lock()
    Self.hostRegistry.removeValue(forKey: frameId)
    Self.childRegistry.removeValue(forKey: frameId)
    Self.lock.unlock()
  }

  @objc func hostReply(_ frameId: String, callId: String, resultJson: String) {
    Self.lock.lock()
    let childCtx = Self.childRegistry[frameId]
    Self.lock.unlock()
    guard let childCtx else { return }
    let payload: [String: Any] = ["callId": callId, "result": resultJson]
    childCtx.sendGlobalEvent(Self.EVENT_HOST_REPLY, withParams: [payload])
  }

  @objc func pushToChild(_ frameId: String, eventName: String, dataJson: String) {
    Self.lock.lock()
    let childCtx = Self.childRegistry[frameId]
    Self.lock.unlock()
    guard let childCtx else { return }
    let payload: [String: Any] = ["event": eventName, "data": dataJson]
    childCtx.sendGlobalEvent(Self.EVENT_PUSH, withParams: [payload])
  }

  // MARK: - Child side

  @objc func registerChild(_ frameId: String) {
    guard let ctx = context else { return }
    Self.lock.lock()
    Self.childRegistry[frameId] = ctx
    Self.lock.unlock()
  }

  @objc func hostCall(_ frameId: String, callId: String, ns: String, method: String, paramsJson: String) {
    Self.lock.lock()
    let hostCtx = Self.hostRegistry[frameId]
    Self.lock.unlock()
    guard let hostCtx else { return }
    let payload: [String: Any] = [
      "frameId": frameId,
      "callId": callId,
      "ns": ns,
      "method": method,
      "params": paramsJson,
    ]
    hostCtx.sendGlobalEvent(Self.EVENT_HOST_CALL, withParams: [payload])
  }
}
