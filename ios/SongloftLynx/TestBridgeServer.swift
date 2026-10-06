import Foundation

/// Lightweight TCP server for e2e test driver communication (port 9230).
/// iOS counterpart of `org.songloft.lynx.test.TestBridgeServer`.
final class TestBridgeServer {

  private let port: UInt16
  private var listener: CFSocket?
  private var isRunning = false

  init(port: UInt16 = 9230) {
    self.port = port
  }

  func start() {
    #if DEBUG
    guard !isRunning else { return }
    isRunning = true

    DispatchQueue.global(qos: .utility).async { [weak self] in
      self?.listenLoop()
    }
    #endif
  }

  private func listenLoop() {
    let serverFd = socket(AF_INET, SOCK_STREAM, 0)
    guard serverFd >= 0 else {
      NSLog("[TestBridge] socket() failed")
      return
    }

    var reuse: Int32 = 1
    setsockopt(serverFd, SOL_SOCKET, SO_REUSEADDR, &reuse, socklen_t(MemoryLayout<Int32>.size))

    var addr = sockaddr_in()
    addr.sin_len = UInt8(MemoryLayout<sockaddr_in>.size)
    addr.sin_family = sa_family_t(AF_INET)
    addr.sin_port = port.bigEndian
    addr.sin_addr.s_addr = inet_addr("127.0.0.1")

    let bindResult = withUnsafePointer(to: &addr) { ptr in
      ptr.withMemoryRebound(to: sockaddr.self, capacity: 1) { sockPtr in
        bind(serverFd, sockPtr, socklen_t(MemoryLayout<sockaddr_in>.size))
      }
    }
    guard bindResult == 0 else {
      NSLog("[TestBridge] bind() failed: \(errno)")
      close(serverFd)
      return
    }

    listen(serverFd, 5)
    NSLog("[TestBridge] TestBridgeServer listening on :\(port)")

    while isRunning {
      let clientFd = accept(serverFd, nil, nil)
      if clientFd < 0 { continue }
      DispatchQueue.global(qos: .utility).async { [weak self] in
        self?.handleClient(fd: clientFd)
      }
    }
    close(serverFd)
  }

  private func handleClient(fd: Int32) {
    let input = FileHandle(fileDescriptor: fd, closeOnDealloc: false)
    let output = FileHandle(fileDescriptor: fd, closeOnDealloc: false)
    var buffer = ""

    while isRunning {
      guard let data = try? input.availableData, !data.isEmpty else { break }
      guard let chunk = String(data: data, encoding: .utf8) else { continue }
      buffer += chunk

      while let nlRange = buffer.range(of: "\n") {
        let line = String(buffer[buffer.startIndex..<nlRange.lowerBound])
        buffer = String(buffer[nlRange.upperBound...])

        let response = processCommand(line)
        if let responseData = (response + "\n").data(using: .utf8) {
          output.write(responseData)
        }
      }
    }
    close(fd)
  }

  private func processCommand(_ line: String) -> String {
    guard let data = line.data(using: .utf8),
          let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
          let id = json["id"] as? Int else {
      return makeError(0, "parse error")
    }

    let method = json["method"] as? String ?? ""
    switch method {
    case "ping":
      return makeResult(id, "\"pong\"")
    case "eval":
      let expr = json["expr"] as? String ?? ""
      return evalSync(id: id, expression: expr)
    default:
      return makeError(id, "unknown method")
    }
  }

  private func evalSync(id: Int, expression: String) -> String {
    guard let module = SongloftTestBridgeModule.shared else {
      return makeError(id, "TestBridgeModule not initialized (LynxView not ready)")
    }

    let (result, error) = module.evaluateJS(id: id, expression: expression)
    if let error = error {
      return makeError(id, error)
    }
    return makeResult(id, result ?? "null")
  }

  private func makeResult(_ id: Int, _ result: String) -> String {
    return "{\"id\":\(id),\"result\":\(result)}"
  }

  private func makeError(_ id: Int, _ error: String) -> String {
    let escaped = error.replacingOccurrences(of: "\"", with: "\\\"")
      .replacingOccurrences(of: "\n", with: "\\n")
    return "{\"id\":\(id),\"error\":\"\(escaped)\"}"
  }
}
