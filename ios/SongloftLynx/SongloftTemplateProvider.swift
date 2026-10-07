import Foundation

/**
 * Loads remote plugin bundles and reads the root template out of app resources.
 * For local templates, `url` is the resource
 * base name (e.g. `main.lynx`); the `.bundle` extension is appended here, so the
 * embedded artifact is `main.lynx.bundle` — same file the Android host reads from
 * `assets/` via `DemoTemplateProvider`.
 *
 * Local asset loading follows the official `integrating-lynx-demo-projects`
 * ios/HelloLynxSwift provider; remote fetchers and signed update selection are host additions.
 */
class SongloftTemplateProvider: NSObject, LynxTemplateProvider, LynxDynamicComponentFetcher, LynxTemplateResourceFetcher {
  func loadDynamicComponent(_ url: String, withLoadedBlock callback: @escaping onComponentLoaded) {
    loadTemplate(withUrl: url) { value, error in
      guard let data = value as? Data, error == nil else {
        callback(nil, error ?? PluginTemplateTransfer.error("Invalid plugin template data"))
        return
      }
      callback(data, nil)
    }
  }

  func fetchTemplate(_ request: LynxResourceRequest, onComplete callback: @escaping LynxTemplateResourceCompletionBlock) {
    loadTemplate(withUrl: request.url) { value, error in
      guard let data = value as? Data, error == nil else {
        callback(nil, error ?? PluginTemplateTransfer.error("Invalid plugin template data"))
        return
      }
      callback(SongloftTemplateResourceFromData(data), nil)
    }
  }

  func fetchSSRData(_ request: LynxResourceRequest, onComplete callback: @escaping LynxSSRResourceCompletionBlock) {
    callback(nil, PluginTemplateTransfer.error("SSR data is not supported"))
  }

  func loadTemplate(withUrl url: String!, onComplete callback: LynxTemplateLoadBlock!) {
    if let url, let scheme = URL(string: url)?.scheme?.lowercased(), ["http", "https"].contains(scheme) {
      PluginTemplateTransfer.fetch(url) { data, error in callback(data, error as NSError?) }
      return
    }
    guard let url, let path = Bundle.main.path(forResource: url, ofType: "bundle") else {
      let error = NSError(
        domain: "org.songloft.lynx",
        code: 404,
        userInfo: [
          NSLocalizedDescriptionKey:
            "Template \(url ?? "<nil>").bundle is missing from app resources — "
            + "run `pnpm run copy-bundle:ios` (it copies dist/main.lynx.bundle).",
        ]
      )
      callback(nil, error)
      return
    }
    do {
      if url == "main.lynx", let updates = BundleUpdateStore.shared {
        do {
          if let candidate = try updates.beginLaunch() {
            callback(candidate, nil)
            return
          }
        } catch { try? updates.failStartup() }
      }
      let data = try Data(contentsOf: URL(fileURLWithPath: path))
      callback(data, nil)
    } catch {
      NSLog("[Songloft] failed to read template %@: %@", path, error.localizedDescription)
      callback(nil, error)
    }
  }
}
