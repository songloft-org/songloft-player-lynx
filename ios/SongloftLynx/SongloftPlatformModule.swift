import UIKit
import UniformTypeIdentifiers

/**
 * Lynx native module `NativeModules.SongloftPlatform` — platform utilities.
 * Opens external URLs and performs file-pick-then-multipart-upload.
 *
 * The iOS counterpart of
 * `org.songloft.lynx.platform.SongloftPlatformModule` (Android).
 */
final class SongloftPlatformModule: NSObject, LynxModule {
  @objc required init(param: Any) {}
  override init() { super.init() }

  @objc static var name: String { "SongloftPlatform" }

  @objc static var methodLookup: [String: String] {
    [
      "openURL": NSStringFromSelector(#selector(SongloftPlatformModule.openURL(_:))),
      "pickAndUploadFile": NSStringFromSelector(
        #selector(SongloftPlatformModule.pickAndUploadFile(_:fieldName:mimeType:callback:))
      ),
      "setInsecureTls": NSStringFromSelector(
        #selector(SongloftPlatformModule.setInsecureTls(_:))
      ),
      "setClipboard": NSStringFromSelector(
        #selector(SongloftPlatformModule.setClipboard(_:))
      ),
      "setClipboardWithResult": NSStringFromSelector(
        #selector(SongloftPlatformModule.setClipboardWithResult(_:callback:))
      ),
      "logWrite": NSStringFromSelector(
        #selector(SongloftPlatformModule.logWrite(_:))
      ),
      "logRead": NSStringFromSelector(
        #selector(SongloftPlatformModule.logRead(_:))
      ),
      "shareFile": NSStringFromSelector(
        #selector(SongloftPlatformModule.shareFile(_:fileName:mimeType:callback:))
      ),
      "shareLogArchive": NSStringFromSelector(
        #selector(SongloftPlatformModule.shareLogArchive(_:authHeader:fileName:callback:))
      ),
    ]
  }

  // Archive entry names and staging layout, shared with the Android/HarmonyOS
  // hosts and the JS fallback path.
  private static let logExportDir = "logexport"
  private static let entryBackend = "backend.log"
  private static let entryBackendError = "backend-error.txt"
  private static let entryFrontend = "frontend.log"

  /**
   * Enable or disable trust-all certificate validation (self-signed servers).
   * Called from JS whenever `appConfig.insecureTls` is written — login, startup
   * hydrate, the server settings page, and profile switches.
   *
   * Was Android-only until batch 45; the contract gate even carried a comment
   * claiming iOS covered this via "ATS plist + custom URLSessionDelegate", but
   * only the plist half existed and ATS does not affect certificate validation.
   * See `InsecureTls` for the three transports this has to reach.
   */
  @objc func setInsecureTls(_ enabled: Bool) {
    InsecureTls.shared.update(enabled)
  }

  /// Copy `text` to the system clipboard. `UIPasteboard` is main-thread-only.
  @objc func setClipboard(_ text: String) {
    writeClipboard(text, callback: nil)
  }

  @objc func setClipboardWithResult(_ text: String, callback: @escaping LynxCallbackBlock) {
    writeClipboard(text, callback: callback)
  }

  private func writeClipboard(_ text: String, callback: LynxCallbackBlock?) {
    DispatchQueue.main.async {
      UIPasteboard.general.string = text
      callback?([NSNull()] as NSArray)
    }
  }

  @objc func openURL(_ url: String) {
    guard let parsed = URL(string: url) else { return }
    DispatchQueue.main.async {
      UIApplication.shared.open(parsed)
    }
  }

  @objc func pickAndUploadFile(_ uploadUrl: String, fieldName: String, mimeType: String, callback: @escaping LynxCallbackBlock) {
    DispatchQueue.main.async {
      guard let vc = Self.topViewController() else {
        callback(["no_view_controller", NSNull()] as NSArray)
        return
      }
      let types: [UTType] = [.json, .data]
      let picker = UIDocumentPickerViewController(forOpeningContentTypes: types)
      picker.allowsMultipleSelection = false
      let delegate = PickerDelegate(uploadUrl: uploadUrl, fieldName: fieldName, callback: callback)
      picker.delegate = delegate
      objc_setAssociatedObject(picker, &PickerDelegate.key, delegate, .OBJC_ASSOCIATION_RETAIN_NONATOMIC)
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

  // MARK: - Client log file (Lynx port of Flutter's FileLogger)
  //
  // The TS layer (`core/logging/client-logger.ts`) owns timestamps and token
  // redaction; this side is a dumb appender that owns the file lifecycle —
  // per-day file name, 3-day cleanup and the 20 MB per-session cap, mirroring
  // `file_logger_native.dart`. The implementation lives in `ClientFileLog`
  // (bottom of this file) so native subsystems (the audio engine) can log
  // into the same file an export reads.

  /// Append one already-formatted line. Fire-and-forget: JS never waits.
  @objc func logWrite(_ line: String) {
    ClientFileLog.writeRaw(line)
  }

  /// Read the current log file; callback receives (error, content-or-null).
  @objc func logRead(_ callback: @escaping LynxCallbackBlock) {
    ClientFileLog.read { error, content in
      DispatchQueue.main.async {
        callback([error ?? NSNull(), content ?? NSNull()] as NSArray)
      }
    }
  }

  /**
   * Decode a base64 payload into a temp file and present the OS share sheet
   * (`UIActivityViewController`). Callback receives (error-or-null).
   */
  @objc func shareFile(_ base64: String, fileName: String, mimeType: String, callback: @escaping LynxCallbackBlock) {
    guard let data = Data(base64Encoded: base64) else {
      callback(["decode_failed", NSNull()] as NSArray)
      return
    }
    // The name comes from our own TS layer, but strip separators anyway so it
    // cannot escape the temp directory.
    let safeName = (fileName as NSString).lastPathComponent
    let url = FileManager.default.temporaryDirectory.appendingPathComponent(safeName)
    do {
      try data.write(to: url, options: .atomic)
    } catch {
      callback(["write_failed", NSNull()] as NSArray)
      return
    }
    Self.presentShareSheet(url) { error in
      if let error {
        callback([error, NSNull()] as NSArray)
      } else {
        callback([NSNull(), NSNull()] as NSArray)
      }
    }
  }

  /**
   * Build the log archive here and hand it to the share sheet — the fast path
   * behind `SongloftPlatform.shareLogArchive`.
   *
   * Why it exists next to `shareFile`: the JS layer used to fetch the backend log
   * (≤10 MiB) and read this app's client log (≤20 MB) into JS strings, deflate
   * both with a pure-JS zipper and base64 the result by hand — on the JS thread
   * of an engine with no JIT — then push the payload back across the bridge.
   * That pause in front of the share sheet is songloft-player-lynx#3. Here JS
   * passes three short strings and every byte is streamed natively.
   *
   * `backendLogUrl` empty skips the backend side. `authHeader` is sent verbatim
   * as `Authorization` (empty = no header). A backend failure writes
   * `backend-error.txt` into the archive rather than failing the export — the
   * semantic the JS path and the Flutter reference both keep.
   *
   * Callback receives (error-or-null, `{"hasBackend":…,"hasFrontend":…}`).
   */
  @objc func shareLogArchive(
    _ backendLogUrl: String, authHeader: String, fileName: String, callback: @escaping LynxCallbackBlock
  ) {
    // Module methods arrive on the JS thread; nothing below may run there.
    DispatchQueue.global(qos: .utility).async {
      let fm = FileManager.default
      let safeName = (fileName as NSString).lastPathComponent
      let baseName = (safeName as NSString).deletingPathExtension
      let container = fm.temporaryDirectory.appendingPathComponent(
        Self.logExportDir, isDirectory: true
      )
      // `.forUploading` zips a *directory*, and the directory's name becomes the
      // archive's single top-level entry — so name it after the archive itself
      // rather than leaking a scratch name to whoever opens the zip.
      let staging = container.appendingPathComponent(
        baseName.isEmpty ? "songloft-logs" : baseName, isDirectory: true
      )
      let fail: (String) -> Void = { message in
        try? fm.removeItem(at: container)
        DispatchQueue.main.async { callback([message, NSNull()] as NSArray) }
      }

      // A leftover staging dir from an interrupted run would ship stale logs
      // inside this archive.
      try? fm.removeItem(at: container)
      do {
        try fm.createDirectory(at: staging, withIntermediateDirectories: true)
      } catch {
        fail("staging_failed")
        return
      }

      let hasBackend = backendLogUrl.isEmpty
        ? false
        : Self.downloadBackendLog(backendLogUrl, authHeader: authHeader, into: staging)
      let hasFrontend = Self.copyClientLog(into: staging)

      let entries = (try? fm.contentsOfDirectory(atPath: staging.path)) ?? []
      if entries.isEmpty {
        // Same message as the JS path, so the toast reads identically whichever
        // path ran.
        fail("no logs to export")
        return
      }

      let archive = fm.temporaryDirectory.appendingPathComponent(safeName)
      do {
        try Self.zipDirectory(staging, to: archive)
      } catch {
        fail("zip_failed")
        return
      }
      try? fm.removeItem(at: container)

      let result = "{\"hasBackend\":\(hasBackend),\"hasFrontend\":\(hasFrontend)}"
      Self.presentShareSheet(archive) { error in
        if let error {
          callback([error, NSNull()] as NSArray)
        } else {
          callback([NSNull(), result] as NSArray)
        }
      }
    }
  }

  /**
   * Zip `dir` to `dest` using the coordinated-read `.forUploading` option —
   * Apple's own directory-to-zip path, so there is no hand-rolled archive
   * format and no third-party dependency (which would also mean touching the
   * hand-written `project.pbxproj`).
   *
   * The zip the coordinator hands over only exists for the duration of the
   * accessor block, hence the copy inside it. `copyItem`, not `moveItem`: the
   * coordinator owns that temp file and cleans it up itself, and moving it out
   * from under it is a bet on an undocumented detail. The extra pass costs a few
   * MB of I/O — nothing next to what this whole change removed.
   */
  private static func zipDirectory(_ dir: URL, to dest: URL) throws {
    var coordinationError: NSError?
    var copyError: Error?
    NSFileCoordinator().coordinate(
      readingItemAt: dir, options: [.forUploading], error: &coordinationError
    ) { zipped in
      do {
        if FileManager.default.fileExists(atPath: dest.path) {
          try FileManager.default.removeItem(at: dest)
        }
        try FileManager.default.copyItem(at: zipped, to: dest)
      } catch {
        copyError = error
      }
    }
    if let coordinationError { throw coordinationError }
    if let copyError { throw copyError }
  }

  /**
   * GET `urlString` straight into `staging/backend.log`. True when the file ended
   * up with content; every failure writes `backend-error.txt` instead.
   *
   * `downloadTask` (not `dataTask`) so the response streams to disk: it is up to
   * 10 MiB, and holding it in memory is what the fast path exists to stop doing.
   * `InsecureTls.shared.session` rather than `URLSession.shared` — a self-signed
   * LAN server is the common setup, and an export has to work when things are
   * broken. Blocking is fine here: the caller is a utility queue, and the
   * session's delegate queue is its own.
   */
  private static func downloadBackendLog(
    _ urlString: String, authHeader: String, into staging: URL
  ) -> Bool {
    guard let url = URL(string: urlString) else {
      writeBackendError("invalid url", into: staging)
      return false
    }
    var request = URLRequest(url: url)
    request.httpMethod = "GET"
    request.timeoutInterval = 60
    if !authHeader.isEmpty {
      request.setValue(authHeader, forHTTPHeaderField: "Authorization")
    }
    let target = staging.appendingPathComponent(entryBackend)
    let done = DispatchSemaphore(value: 0)
    var ok = false
    let task = InsecureTls.shared.session.downloadTask(with: request) { tempUrl, response, error in
      defer { done.signal() }
      if let error {
        writeBackendError(error.localizedDescription, into: staging)
        return
      }
      let status = (response as? HTTPURLResponse)?.statusCode ?? 0
      guard (200...299).contains(status), let tempUrl else {
        writeBackendError("HTTP \(status)", into: staging)
        return
      }
      do {
        try FileManager.default.moveItem(at: tempUrl, to: target)
      } catch {
        writeBackendError("write_failed", into: staging)
        return
      }
      let attributes = try? FileManager.default.attributesOfItem(atPath: target.path)
      if ((attributes?[.size] as? NSNumber)?.intValue ?? 0) == 0 {
        // An empty side is omitted silently, not reported as a failure.
        try? FileManager.default.removeItem(at: target)
        return
      }
      ok = true
    }
    task.resume()
    done.wait()
    return ok
  }

  private static func writeBackendError(_ reason: String, into staging: URL) {
    let note = "Failed to fetch backend logs: \(reason)\n"
    // The note is a courtesy to whoever reads the archive; losing it must not
    // lose the export.
    try? note.data(using: .utf8)?.write(
      to: staging.appendingPathComponent(entryBackendError), options: .atomic
    )
  }

  /**
   * Copy this app's client log into `staging/frontend.log`. False when there is
   * nothing to copy. `ClientFileLog.copyTo` runs on the log queue, so lines
   * queued before the export are already on disk.
   */
  private static func copyClientLog(into staging: URL) -> Bool {
    let target = staging.appendingPathComponent(entryFrontend)
    let done = DispatchSemaphore(value: 0)
    var bytes = 0
    ClientFileLog.copyTo(target) { copied in
      bytes = copied
      done.signal()
    }
    done.wait()
    if bytes <= 0 {
      try? FileManager.default.removeItem(at: target)
      return false
    }
    return true
  }

  /**
   * Present `url` through `UIActivityViewController`. Always hops to the main
   * thread — UIKit presentation is main-thread-only and the callers run on the
   * JS thread or a utility queue.
   */
  private static func presentShareSheet(_ url: URL, onDone: @escaping (String?) -> Void) {
    DispatchQueue.main.async {
      guard let vc = topViewController() else {
        onDone("no_view_controller")
        return
      }
      let activity = UIActivityViewController(activityItems: [url], applicationActivities: nil)
      // iPad presents popovers from a bar-button anchor; on iPhone this is nil
      // and the property is ignored.
      activity.popoverPresentationController?.sourceView = vc.view
      activity.popoverPresentationController?.sourceRect = CGRect(
        x: vc.view.bounds.midX, y: vc.view.bounds.midY, width: 0, height: 0
      )
      vc.present(activity, animated: true)
      onDone(nil)
    }
  }
}

// MARK: - Picker delegate + upload

private class PickerDelegate: NSObject, UIDocumentPickerDelegate {
  static var key = "PickerDelegate"

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
      callback(["cancelled", NSNull()] as NSArray)
      return
    }
    let accessing = fileUrl.startAccessingSecurityScopedResource()
    defer { if accessing { fileUrl.stopAccessingSecurityScopedResource() } }

    guard let data = try? Data(contentsOf: fileUrl) else {
      callback(["read_failed", NSNull()] as NSArray)
      return
    }
    let fileName = fileUrl.lastPathComponent
    upload(data: data, fileName: fileName)
  }

  func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
    callback(["cancelled", NSNull()] as NSArray)
  }

  private func upload(data: Data, fileName: String) {
    guard let url = URL(string: uploadUrl) else {
      callback(["invalid_url", NSNull()] as NSArray)
      return
    }
    let boundary = "----LynxBoundary\(UUID().uuidString)"
    var request = URLRequest(url: url)
    if url.path.hasSuffix("/api/v1/jsplugins/upload") {
      request.timeoutInterval = 240
    }
    request.httpMethod = "POST"
    request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")

    var body = Data()
    body.append("--\(boundary)\r\n".data(using: .utf8)!)
    body.append("Content-Disposition: form-data; name=\"\(fieldName)\"; filename=\"\(fileName)\"\r\n".data(using: .utf8)!)
    body.append("Content-Type: application/json\r\n\r\n".data(using: .utf8)!)
    body.append(data)
    body.append("\r\n--\(boundary)--\r\n".data(using: .utf8)!)
    request.httpBody = body

    // `InsecureTls.session` rather than `URLSession.shared`: the latter takes no
    // delegate, so it can never accept a self-signed certificate — and importing
    // a backup to a self-signed server is exactly this code path.
    InsecureTls.shared.session.dataTask(with: request) { [weak self] responseData, response, error in
      DispatchQueue.main.async {
        if let error {
          self?.callback([error.localizedDescription, NSNull()] as NSArray)
          return
        }
        guard let httpResponse = response as? HTTPURLResponse,
              (200...299).contains(httpResponse.statusCode),
              let responseData
        else {
          let statusCode = (response as? HTTPURLResponse)?.statusCode ?? 0
          let errBody = responseData.flatMap { String(data: $0, encoding: .utf8) } ?? ""
          self?.callback(["HTTP \(statusCode): \(errBody)", NSNull()] as NSArray)
          return
        }
        let resultBody = String(data: responseData, encoding: .utf8) ?? ""
        self?.callback([NSNull(), resultBody] as NSArray)
      }
    }.resume()
  }
}

/**
 * Process-wide client log file — the native-side sibling of the TS
 * `client-logger` (`src/core/logging/client-logger.ts`). Both write the same
 * per-day file, so an exported log bundle carries native diagnostics (the
 * audio engine's lock-screen metadata chain) next to the JS ones. Before this
 * existed, native Swift code logged nowhere but the console — invisible to
 * "export logs", exactly the blind spot that made notification-lyric reports
 * undiagnosable.
 *
 * Lives in this file rather than its own because the Xcode project lists
 * source files explicitly (`project.pbxproj`); sharing the module's file
 * keeps the project untouched — and this module is already the log's host.
 *
 * Line shapes:
 * - `writeRaw` appends verbatim — `SongloftPlatformModule.logWrite` (the TS
 *   path) lands here with lines already formatted (timestamp + redaction).
 * - `write` stamps `[HH:mm:ss.SSS] L/tag ` in the same shape the TS layer
 *   uses (`formatLogEntry`), so the file reads as one continuous timeline.
 *   All formatting happens on the log queue: `DateFormatter` is not
 *   thread-safe and callers arrive from several threads.
 */
enum ClientFileLog {
  private static let queue = DispatchQueue(label: "org.songloft.lynx.clientlog")
  private static var fileUrl: URL?
  private static var sessionBytes = 0
  private static var capReached = false
  private static let maxSessionBytes = 20 * 1024 * 1024
  private static let maxAgeDays = 3
  // Same file-name shape as Flutter's `_logNamePattern`, so cleanup only ever
  // touches files this feature wrote.
  private static let namePattern = try! NSRegularExpression(
    pattern: "^songloft_(\\d{4}-\\d{2}-\\d{2})(?:_[A-Za-z0-9]+)?\\.log$"
  )
  private static let dayFormatter: DateFormatter = {
    let formatter = DateFormatter()
    formatter.dateFormat = "yyyy-MM-dd"
    formatter.locale = Locale(identifier: "en_US_POSIX")
    return formatter
  }()
  private static let timeFormatter: DateFormatter = {
    let formatter = DateFormatter()
    formatter.dateFormat = "HH:mm:ss.SSS"
    formatter.locale = Locale(identifier: "en_US_POSIX")
    return formatter
  }()

  /// Append one line, stamped `[HH:mm:ss.SSS] L/tag ` to match the TS layer's
  /// entry shape. Fire-and-forget, thread-safe, never throws into the caller.
  static func write(_ level: String, tag: String, _ message: String) {
    queue.async {
      let line = "[\(timeFormatter.string(from: Date()))] \(level)/\(tag) \(message)"
      appendLine(line)
    }
  }

  /// Append one already-formatted line (the TS `logWrite` path).
  static func writeRaw(_ line: String) {
    queue.async {
      appendLine(line)
    }
  }

  /// Read the current log file on the log queue. `completion(error, content)`
  /// carries a null error, or null content when no file exists yet.
  static func read(_ completion: @escaping (String?, String?) -> Void) {
    queue.async {
      guard let url = ensureLogFile(),
        FileManager.default.fileExists(atPath: url.path),
        let data = try? Data(contentsOf: url),
        let content = String(data: data, encoding: .utf8)
      else {
        completion(nil, nil)
        return
      }
      completion(nil, content)
    }
  }

  /**
   * Copy the current log file to `dest`, then report how many bytes landed
   * (0 = nothing to copy). Runs on the log queue **on purpose**: every line
   * queued before this call is already written by the time the copy starts,
   * which is the same ordering guarantee `read` gives — an export must not miss
   * the lines the user just produced while reproducing the bug.
   *
   * A file copy, not a read: the file is capped at 20 MB and this used to reach
   * JS as one `String` across the bridge, which is half of why the export felt
   * slow.
   */
  static func copyTo(_ dest: URL, completion: @escaping (Int) -> Void) {
    queue.async {
      guard let url = ensureLogFile(),
        FileManager.default.fileExists(atPath: url.path)
      else {
        completion(0)
        return
      }
      do {
        if FileManager.default.fileExists(atPath: dest.path) {
          try FileManager.default.removeItem(at: dest)
        }
        try FileManager.default.copyItem(at: url, to: dest)
        let attributes = try FileManager.default.attributesOfItem(atPath: dest.path)
        completion((attributes[.size] as? NSNumber)?.intValue ?? 0)
      } catch {
        // A half-written copy must not reach the archive as if it were the
        // whole log.
        try? FileManager.default.removeItem(at: dest)
        completion(0)
      }
    }
  }

  private static func appendLine(_ line: String) {
    guard !capReached, let url = ensureLogFile() else { return }
    guard let data = (line + "\n").data(using: .utf8) else { return }
    if sessionBytes + data.count > maxSessionBytes {
      capReached = true
      let notice = "[ClientFileLog] session log cap reached "
        + "(\(maxSessionBytes / (1024 * 1024))MB); further lines go to console only\n"
      if let noticeData = notice.data(using: .utf8) {
        append(noticeData, to: url)
      }
      return
    }
    append(data, to: url)
    sessionBytes += data.count
  }

  private static func logDirectory() -> URL? {
    guard let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
    else { return nil }
    let dir = base.appendingPathComponent("logs", isDirectory: true)
    do {
      try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
      return dir
    } catch {
      return nil
    }
  }

  /// Lazily create today's log file and sweep files older than 3 days.
  private static func ensureLogFile() -> URL? {
    if let existing = fileUrl { return existing }
    guard let dir = logDirectory() else { return nil }
    cleanOldLogs(in: dir)
    let url = dir.appendingPathComponent("songloft_\(dayFormatter.string(from: Date())).log")
    fileUrl = url
    return url
  }

  private static func cleanOldLogs(in dir: URL) {
    let cutoff = Date().addingTimeInterval(-Double(maxAgeDays) * 24 * 60 * 60)
    guard let entries = try? FileManager.default.contentsOfDirectory(
      at: dir, includingPropertiesForKeys: nil
    ) else { return }
    for entry in entries {
      let name = entry.lastPathComponent
      let range = NSRange(name.startIndex..<name.endIndex, in: name)
      guard let match = namePattern.firstMatch(in: name, range: range),
        let dateRange = Range(match.range(at: 1), in: name),
        let date = dayFormatter.date(from: String(name[dateRange]))
      else { continue }
      if date < cutoff {
        try? FileManager.default.removeItem(at: entry)
      }
    }
  }

  private static func append(_ data: Data, to url: URL) {
    if FileManager.default.fileExists(atPath: url.path) {
      if let handle = try? FileHandle(forWritingTo: url) {
        defer { try? handle.close() }
        _ = try? handle.seekToEnd()
        try? handle.write(contentsOf: data)
      }
    } else {
      try? data.write(to: url, options: .atomic)
    }
  }
}
