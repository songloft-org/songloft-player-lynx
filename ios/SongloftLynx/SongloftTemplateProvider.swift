import Foundation

/**
 * Reads a Lynx template bundle out of the app's resources. `url` is the resource
 * base name (e.g. `main.lynx`); the `.bundle` extension is appended here, so the
 * embedded artifact is `main.lynx.bundle` — same file the Android host reads from
 * `assets/` via `DemoTemplateProvider`.
 *
 * Copied from the official `integrating-lynx-demo-projects`
 * ios/HelloLynxSwift `DemoLynxProvider`, bar the name and error text.
 */
class SongloftTemplateProvider: NSObject, LynxTemplateProvider {
  func loadTemplate(withUrl url: String!, onComplete callback: LynxTemplateLoadBlock!) {
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
      let data = try Data(contentsOf: URL(fileURLWithPath: path))
      callback(data, nil)
    } catch {
      NSLog("[Songloft] failed to read template %@: %@", path, error.localizedDescription)
      callback(nil, error)
    }
  }
}
