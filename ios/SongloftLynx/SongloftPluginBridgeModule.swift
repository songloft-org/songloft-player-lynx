import Foundation
import UIKit

final class SongloftPluginBridgeModule: NSObject, LynxContextModule {
  @objc static var name: String { "SongloftPluginBridge" }

  @objc static var methodLookup: [String: String] {
    [
      "socketOpen": NSStringFromSelector(#selector(SongloftPluginBridgeModule.socketOpen(_:id:url:))),
      "socketSend": NSStringFromSelector(#selector(SongloftPluginBridgeModule.socketSend(_:id:text:))),
      "socketClose": NSStringFromSelector(#selector(SongloftPluginBridgeModule.socketClose(_:id:))),
      "openUrl": NSStringFromSelector(#selector(SongloftPluginBridgeModule.openUrl(_:url:))),
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
    guard Self.hostRegistry[frameId] === context else { Self.lock.unlock(); return }
    let stale = sockets.filter { $0.key.hasPrefix(frameId + "|") }
    for (key, task) in stale { sockets.removeValue(forKey: key); task.cancel(with: .goingAway, reason: nil) }
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


  private var sockets: [String: URLSessionWebSocketTask] = [:]
  private func socketEvent(_ frameId: String, id: String, type: String, data: String = "") {
    guard let raw = try? JSONSerialization.data(withJSONObject: ["id": id, "type": type, "data": data]),
          let json = String(data: raw, encoding: .utf8) else { return }
    pushToChild(frameId, eventName: "pluginSocket", dataJson: json)
  }
  @objc func socketOpen(_ frameId: String, id: String, url: String) {
    guard let address = URL(string: url), ["ws", "wss"].contains(address.scheme ?? "") else { return }
    let key = frameId + "|" + id
    Self.lock.lock()
    guard Self.hostRegistry[frameId] === context, sockets[key] == nil,
          sockets.keys.filter({ $0.hasPrefix(frameId + "|") }).count < 8 else {
      Self.lock.unlock(); socketEvent(frameId, id: id, type: "error"); return
    }
    let task = InsecureTls.shared.session.webSocketTask(with: address)
    sockets[key] = task
    Self.lock.unlock()
    task.resume()
    task.sendPing { [weak self, weak task] error in
      guard let self, let task, self.ownsSocket(key, task) else { return }
      if error != nil { self.socketFailed(frameId, id: id, key: key, task: task); return }
      self.socketEvent(frameId, id: id, type: "open")
      self.receiveSocket(frameId, id: id, key: key, task: task)
    }
  }
  private func ownsSocket(_ key: String, _ task: URLSessionWebSocketTask) -> Bool {
    Self.lock.lock(); defer { Self.lock.unlock() }; return sockets[key] === task
  }
  private func socketFailed(_ frameId: String, id: String, key: String, task: URLSessionWebSocketTask) {
    Self.lock.lock()
    guard sockets[key] === task else { Self.lock.unlock(); return }
    sockets.removeValue(forKey: key); Self.lock.unlock()
    task.cancel(with: .goingAway, reason: nil)
    socketEvent(frameId, id: id, type: "error")
  }
  private func receiveSocket(_ frameId: String, id: String, key: String, task: URLSessionWebSocketTask) {
    task.receive { [weak self, weak task] result in
      guard let self, let task, self.ownsSocket(key, task) else { return }
      switch result {
      case .success(.string(let text)):
        self.socketEvent(frameId, id: id, type: "message", data: text)
      case .success: break
      case .failure:
        self.socketFailed(frameId, id: id, key: key, task: task); return
      }
      self.receiveSocket(frameId, id: id, key: key, task: task)
    }
  }
  @objc func socketSend(_ frameId: String, id: String, text: String) {
    Self.lock.lock()
    let task = Self.hostRegistry[frameId] === context ? sockets[frameId + "|" + id] : nil
    Self.lock.unlock()
    task?.send(.string(text)) { [weak self, weak task] error in
      if error != nil, let self, let task { self.socketFailed(frameId, id: id, key: frameId + "|" + id, task: task) }
    }
  }
  @objc func socketClose(_ frameId: String, id: String) {
    Self.lock.lock()
    let task = Self.hostRegistry[frameId] === context ? sockets.removeValue(forKey: frameId + "|" + id) : nil
    Self.lock.unlock(); task?.cancel(with: .normalClosure, reason: nil)
  }
  @objc func openUrl(_ frameId: String, url: String) {
    Self.lock.lock(); let owned = Self.hostRegistry[frameId] === context; Self.lock.unlock()
    guard owned, let address = URL(string: url), ["http", "https"].contains(address.scheme ?? "") else { return }
    DispatchQueue.main.async { UIApplication.shared.open(address) }
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
