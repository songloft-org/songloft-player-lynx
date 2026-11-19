import Foundation

#if HAS_SONGLOFT_BACKEND
@_silgen_name("MobileStart")
private func linkedMobileStart(
  _ dataDir: UnsafeRawPointer?, _ musicDir: UnsafeRawPointer?, _ port: Int,
  _ ret0: UnsafeMutablePointer<Int>?, _ error: UnsafeMutableRawPointer?
) -> ObjCBool
@_silgen_name("MobileStop") private func linkedMobileStop()
@_silgen_name("MobileIsRunning") private func linkedMobileIsRunning() -> ObjCBool
@_silgen_name("MobileGetPort") private func linkedMobileGetPort() -> Int
#endif

/** Lynx bridge for the optional gomobile backend on iOS. */
final class SongloftBundleModule: NSObject, LynxModule {
  @objc static var name: String { "SongloftBundle" }

  @objc static var methodLookup: [String: String] {
    [
      "start": NSStringFromSelector(#selector(start(_:musicDir:port:callback:))),
      "stop": NSStringFromSelector(#selector(stop(_:))),
      "isRunning": NSStringFromSelector(#selector(isRunning(_:))),
      "getPort": NSStringFromSelector(#selector(getPort(_:))),
      "getAdminPassword": NSStringFromSelector(#selector(getAdminPassword(_:callback:))),
      "getDefaultMusicDirectory": NSStringFromSelector(#selector(getDefaultMusicDirectory(_:))),
      "pickMusicDirectory": NSStringFromSelector(#selector(pickMusicDirectory(_:))),
      "ensureMusicPermission": NSStringFromSelector(#selector(ensureMusicPermission(_:))),
    ]
  }

  @objc(initWithParam:)
  convenience init(param: Any) { self.init() }

  @objc func start(_ dataDir: String, musicDir: String, port: Int, callback: @escaping (Any) -> Void) {
#if HAS_SONGLOFT_BACKEND
    DispatchQueue.global(qos: .userInitiated).async {
      let data = dataDir as NSString
      let music = musicDir as NSString
      var actualPort = 0
      let ok = linkedMobileStart(
        Unmanaged.passUnretained(data).toOpaque(),
        Unmanaged.passUnretained(music).toOpaque(),
        port,
        &actualPort,
        nil
      ).boolValue
      withExtendedLifetime((data, music)) {}
      DispatchQueue.main.async {
        callback(ok ? [NSNull(), actualPort] as NSArray : ["bundle_start_failed", NSNull()] as NSArray)
      }
    }
#else
    callback(["bundle_backend_unavailable", NSNull()] as NSArray)
#endif
  }

  @objc func stop(_ callback: @escaping (Any) -> Void) {
#if HAS_SONGLOFT_BACKEND
    DispatchQueue.global(qos: .userInitiated).async {
      linkedMobileStop()
      DispatchQueue.main.async { callback(NSNull()) }
    }
#else
    callback(NSNull())
#endif
  }

  @objc func isRunning(_ callback: @escaping (Any) -> Void) {
#if HAS_SONGLOFT_BACKEND
    callback(linkedMobileIsRunning().boolValue)
#else
    callback(false)
#endif
  }

  @objc func getPort(_ callback: @escaping (Any) -> Void) {
#if HAS_SONGLOFT_BACKEND
    callback(linkedMobileGetPort())
#else
    callback(0)
#endif
  }

  @objc func getAdminPassword(_ dataDir: String, callback: @escaping (Any) -> Void) {
    let path = URL(fileURLWithPath: dataDir, isDirectory: true).appendingPathComponent("admin_password")
    guard let password = try? String(contentsOf: path, encoding: .utf8).trimmingCharacters(in: .whitespacesAndNewlines), !password.isEmpty else {
      callback(["bundle_password_unavailable", NSNull()] as NSArray)
      return
    }
    callback([NSNull(), password] as NSArray)
  }

  @objc func getDefaultMusicDirectory(_ callback: @escaping (Any) -> Void) {
    callback(FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first?.path ?? NSHomeDirectory())
  }

  // iOS sandbox access is limited to the app's Documents directory; the Files
  // app exposes this directory when file sharing is enabled in Info.plist.
  @objc func pickMusicDirectory(_ callback: @escaping (Any) -> Void) {
    getDefaultMusicDirectory(callback)
  }

  @objc func ensureMusicPermission(_ callback: @escaping (Any) -> Void) {
    callback([NSNull(), true] as NSArray)
  }
}
