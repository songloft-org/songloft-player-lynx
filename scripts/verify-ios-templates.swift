import Foundation

/// Compile/run on Apple with the actual transfer and TLS policy, without Lynx/UIKit stubs.
@main
struct VerifyIOSTemplates {
  final class Delivery {
    private let lock = NSLock()
    private let done = DispatchSemaphore(value: 0)
    private var count = 0
    private var body: Data?
    private var error: Error?

    func accept(_ data: Data?, _ failure: Error?) {
      lock.lock()
      count += 1
      body = data
      error = failure
      lock.unlock()
      done.signal()
    }

    func result() throws -> (Data?, Error?) {
      try VerifyIOSTemplates.check(done.wait(timeout: .now() + 10) == .success, "template_callback_timeout")
      lock.lock()
      defer { lock.unlock() }
      try VerifyIOSTemplates.check(count == 1, "duplicate_callback")
      return (body, error)
    }
  }

  static func check(_ value: @autoclosure () -> Bool, _ message: String) throws {
    if !value() { throw PluginTemplateTransfer.error(message) }
  }

  static func fetch(_ address: String, limit: Int = 1024, timeout: TimeInterval = 30) -> Delivery {
    let delivery = Delivery()
    PluginTemplateTransfer.fetch(address, limit: limit, timeout: timeout, completion: delivery.accept)
    return delivery
  }

  static func main() throws {
    guard CommandLine.arguments.count == 2 else { throw PluginTemplateTransfer.error("expected_port_file") }
    let ports = try JSONDecoder().decode([String: Int].self, from: Data(contentsOf: URL(fileURLWithPath: CommandLine.arguments[1])))
    guard let http = ports["http"], let https = ports["https"] else { throw PluginTemplateTransfer.error("invalid_ports") }
    let base = "http://127.0.0.1:\(http)", secure = "https://127.0.0.1:\(https)"
    let expected = Data([0, 1, 127, 128, 255])
    InsecureTls.shared.update(false)
    defer { InsecureTls.shared.update(false) }

    // Seed the system stores; independent sessions must never send these fixture credentials.
    let cookie = HTTPCookie(properties: [.domain: "127.0.0.1", .path: "/", .name: "songloft-template-verifier", .value: "TEST_ONLY"])!
    HTTPCookieStorage.shared.setCookie(cookie)
    let space = URLProtectionSpace(host: "127.0.0.1", port: http, protocol: "http", realm: "template",
                                   authenticationMethod: NSURLAuthenticationMethodHTTPBasic)
    let credential = URLCredential(user: "account", password: "TEST_ONLY", persistence: .forSession)
    URLCredentialStorage.shared.setDefaultCredential(credential, for: space)
    defer {
      HTTPCookieStorage.shared.deleteCookie(cookie)
      URLCredentialStorage.shared.remove(credential, for: space)
    }

    for path in ["/bundle", "/redirect"] {
      let (data, error) = try fetch(base + path).result()
      try check(data == expected && error == nil, "binary_or_redirect")
      try check(InsecureTls.shared.listenerCount == 0, "listener_leak")
    }
    for (path, message) in [("/404", "Plugin template HTTP 404"), ("/empty", "Empty plugin template"),
                            ("/large", "Plugin template too large"), ("/unknown", "Plugin template too large"),
                            ("/loop", "Invalid plugin template redirect")] {
      let (data, error) = try fetch(base + path, limit: 16).result()
      try check(data == nil && error?.localizedDescription == message, "unexpected_error_\(path)")
      try check(InsecureTls.shared.listenerCount == 0, "failed_listener_leak")
    }
    // Foundation may reject authentication/credential redirects before our response delegate.
    for path in ["/auth", "/userinfo"] {
      let (data, error) = try fetch(base + path).result()
      try check(data == nil && error != nil, "credentials_not_rejected_\(path)")
      try check(InsecureTls.shared.listenerCount == 0, "credential_error_listener_leak")
    }
    for address in ["file:///etc/passwd", "http://user:TEST_ONLY@127.0.0.1:\(http)/bundle", base + "/\nfile"] {
      let (data, error) = try fetch(address).result()
      try check(data == nil && error?.localizedDescription == "Invalid plugin template URL", "invalid_url")
    }
    let (_, timeoutError) = try fetch(base + "/stall", timeout: 0.25).result()
    try check((timeoutError as NSError?)?.code == NSURLErrorTimedOut, "transfer_timeout")

    let (_, untrusted) = try fetch(secure + "/bundle").result()
    try check(untrusted != nil, "self_signed_accepted_by_default")
    InsecureTls.shared.update(true)
    let (trustedData, trustedError) = try fetch(secure + "/bundle").result()
    try check(trustedData == expected && trustedError == nil, "explicit_tls_bypass")
    InsecureTls.shared.update(false)
    let (_, tightened) = try fetch(secure + "/bundle").result()
    try check(tightened != nil, "tls_policy_not_restored")

    let slow = fetch(base + "/slow", limit: 1024 * 1024)
    let (fastData, fastError) = try fetch(base + "/bundle").result()
    try check(fastData == expected && fastError == nil, "parallel_fast_request")
    try check(InsecureTls.shared.listenerCount == 1, "parallel_session_not_isolated")
    InsecureTls.shared.update(false) // No change must not cancel the pending transfer.
    try check(InsecureTls.shared.listenerCount == 1, "unchanged_policy_cancelled")
    InsecureTls.shared.update(true)
    let (slowData, cancelled) = try slow.result()
    try check(slowData == nil && cancelled?.localizedDescription == "TLS policy changed", "inflight_tls_cancel")
    try check(InsecureTls.shared.listenerCount == 0, "cancelled_listener_leak")

    let (statsData, statsError) = try fetch(base + "/stats", limit: 8192).result()
    try check(statsError == nil && statsData != nil, "missing_fixture_stats")
    let stats = try JSONSerialization.jsonObject(with: statsData!) as! [String: Any]
    try check((stats["credentials"] as? [String])?.isEmpty == true, "credential_leak")
    let counts = stats["counts"] as? [String: Int] ?? [:]
    try check(counts["/loop"] == 6, "redirect_limit")
    try check(InsecureTls.shared.listenerCount == 0, "final_listener_leak")
    print("Verified iOS plugin templates: binary, headers, HTTP/errors, streaming limits, redirects, timeout, TLS changes and cleanup")
  }
}
