import UIKit

/**
 * Lynx native module `NativeModules.SongloftPlatform` — platform utilities.
 * Opens external URLs and performs file-pick-then-multipart-upload.
 *
 * The iOS counterpart of
 * `org.songloft.lynx.platform.SongloftPlatformModule` (Android).
 */
final class SongloftPlatformModule: NSObject, LynxModule {
  @objc static var name: String { "SongloftPlatform" }

  @objc static var methodLookup: [String: String] {
    [
      "openURL": NSStringFromSelector(#selector(SongloftPlatformModule.openURL(_:))),
      "pickAndUploadFile": NSStringFromSelector(
        #selector(SongloftPlatformModule.pickAndUploadFile(_:fieldName:mimeType:callback:))
      ),
    ]
  }

  @objc func openURL(_ url: String) {
    guard let parsed = URL(string: url) else { return }
    DispatchQueue.main.async {
      UIApplication.shared.open(parsed)
    }
  }

  /**
   * Present a document picker, then multipart-upload the chosen file.
   * Callback receives (error: String?, responseBody: String?).
   */
  @objc func pickAndUploadFile(_ uploadUrl: String, fieldName: String, mimeType: String, callback: @escaping LynxCallbackBlock) {
    DispatchQueue.main.async {
      guard let vc = Self.topViewController() else {
        callback(["no_view_controller", NSNull()])
        return
      }
      let picker = UIDocumentPickerViewController(forOpeningContentTypes: [.json, .data])
      picker.allowsMultipleSelection = false
      let delegate = PickerDelegate(uploadUrl: uploadUrl, fieldName: fieldName, callback: callback)
      picker.delegate = delegate
      // Retain the delegate until dismissed
      objc_setAssociatedObject(picker, "delegate", delegate, .OBJC_ASSOCIATION_RETAIN_NONATOMIC)
      vc.present(picker, animated: true)
    }
  }

  private static func topViewController() -> UIViewController? {
    guard let scene = UIApplication.shared.connectedScenes
      .compactMap({ $0 as? UIWindowScene }).first,
      let root = scene.windows.first(where: { $0.isKeyWindow })?.rootViewController
    else { return nil }
    var top = root
    while let presented = top.presentedViewController { top = presented }
    return top
  }
}

// MARK: - Picker delegate + upload

private class PickerDelegate: NSObject, UIDocumentPickerDelegate {
  let uploadUrl: String
  let fieldName: String
  let callback: LynxCallbackBlock

  init(uploadUrl: String, fieldName: String, callback: @escaping LynxCallbackBlock) {
    self.uploadUrl = uploadUrl
    self.fieldName = fieldName
    self.callback = callback
  }

  func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
    guard let fileUrl = urls.first else {
      callback(["cancelled", NSNull()])
      return
    }
    let accessing = fileUrl.startAccessingSecurityScopedResource()
    defer { if accessing { fileUrl.stopAccessingSecurityScopedResource() } }

    guard let data = try? Data(contentsOf: fileUrl) else {
      callback(["read_failed", NSNull()])
      return
    }
    let fileName = fileUrl.lastPathComponent

    upload(data: data, fileName: fileName)
  }

  func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
    callback(["cancelled", NSNull()])
  }

  private func upload(data: Data, fileName: String) {
    guard let url = URL(string: uploadUrl) else {
      callback(["invalid_url", NSNull()])
      return
    }
    let boundary = "----LynxBoundary\(UUID().uuidString)"
    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")

    var body = Data()
    body.append("--\(boundary)\r\n".data(using: .utf8)!)
    body.append("Content-Disposition: form-data; name=\"\(fieldName)\"; filename=\"\(fileName)\"\r\n".data(using: .utf8)!)
    body.append("Content-Type: application/json\r\n\r\n".data(using: .utf8)!)
    body.append(data)
    body.append("\r\n--\(boundary)--\r\n".data(using: .utf8)!)
    request.httpBody = body

    URLSession.shared.dataTask(with: request) { [weak self] responseData, response, error in
      DispatchQueue.main.async {
        if let error {
          self?.callback([error.localizedDescription, NSNull()])
          return
        }
        guard let httpResponse = response as? HTTPURLResponse,
              (200...299).contains(httpResponse.statusCode),
              let responseData
        else {
          let statusCode = (response as? HTTPURLResponse)?.statusCode ?? 0
          let errBody = responseData.flatMap { String(data: $0, encoding: .utf8) } ?? ""
          self?.callback(["HTTP \(statusCode): \(errBody)", NSNull()])
          return
        }
        let body = String(data: responseData, encoding: .utf8) ?? ""
        self?.callback([NSNull(), body])
      }
    }.resume()
  }
}
