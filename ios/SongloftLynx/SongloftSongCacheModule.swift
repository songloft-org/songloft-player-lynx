import Foundation

/**
 * Song audio file caching module.
 * Exposed to JS as `NativeModules.SongloftSongCache`.
 *
 * Downloads playable song URLs into app storage so they can be replayed offline or
 * without re-fetching. Uses `InsecureTls.shared.session` so that self-signed
 * Songloft servers are reachable.
 *
 * Design notes (each is a bug this module previously shipped — keep them):
 *
 *  - **Storage lives in the Documents directory, not Caches.** This is a
 *    *user-directed* cache ("cache this song on the device"), not a transient one:
 *    the OS may evict Caches under storage pressure, which would drop files the user
 *    explicitly asked to keep. Documents is only removed with the app.
 *  - **Callbacks return a playable `file://` URL**, taken from the file URL's own
 *    `absoluteString` — never by concatenating a file-scheme prefix onto the path,
 *    which breaks on spaces and non-ASCII. The audio engine builds its `AVURLAsset`
 *    from this string; a bare path is not a valid absolute URL and silently fails to
 *    load.
 *  - **Files are named `{songId}.{ext}`** so the player can infer the container,
 *    and are committed atomically (the download lands in a temp file and is moved
 *    into place), so a failed download never leaves a half-written "playable" file.
 *  - **Downloads are checked against `maxBytes`** before being committed; an
 *    oversized file is discarded and reported with the machine-readable
 *    `limit_exceeded` sentinel (shared verbatim with the TS facade). Unlike the
 *    Android side — which aborts mid-stream — `URLSession.downloadTask` only exposes
 *    the finished temp file, so the cap is enforced at commit time. The storage
 *    invariant (never keep a file over the cap) holds either way; the trade is that
 *    a single song larger than the whole remaining cap is downloaded before being
 *    rejected.
 */
final class SongloftSongCacheModule: NSObject, LynxModule {
    @objc required init(param: Any) {}
    override init() { super.init() }

    @objc static var name: String { "SongloftSongCache" }

    /// Shared verbatim with the TS facade and the Android module; asserted by the
    /// native-module contract test so the three cannot drift.
    private static let limitExceededError = "limit_exceeded"

    @objc static var methodLookup: [String: String] {
        [
            "download": NSStringFromSelector(#selector(SongloftSongCacheModule.download(_:url:ext:maxBytes:callback:))),
            "getCacheInfo": NSStringFromSelector(#selector(SongloftSongCacheModule.getCacheInfo(_:callback:))),
            "remove": NSStringFromSelector(#selector(SongloftSongCacheModule.remove(_:callback:))),
            "getCacheSize": NSStringFromSelector(#selector(SongloftSongCacheModule.getCacheSize(_:))),
            "clearAll": NSStringFromSelector(#selector(SongloftSongCacheModule.clearAll(_:))),
        ]
    }

    private static var cacheDir: URL {
        let documents = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        return documents.appendingPathComponent("song_cache", isDirectory: true)
    }

    /// The on-disk name for a song: `{songId}.{ext}`, or `{songId}` when ext is blank.
    private static func fileName(_ songId: String, ext: String) -> String {
        var trimmed = ext.trimmingCharacters(in: .whitespaces)
        if trimmed.hasPrefix(".") { trimmed.removeFirst() }
        return trimmed.isEmpty ? songId : "\(songId).\(trimmed)"
    }

    /// Locate a cached file for `songId` — the exact name or any `{songId}.<ext>`.
    /// The dotted prefix matters, so song `12` never matches `123.mp3`.
    private static func findCachedFile(_ songId: String) -> URL? {
        let dir = cacheDir
        let exact = dir.appendingPathComponent(songId)
        if FileManager.default.fileExists(atPath: exact.path) { return exact }
        let prefix = "\(songId)."
        guard let entries = try? FileManager.default.contentsOfDirectory(atPath: dir.path) else {
            return nil
        }
        return entries
            .first { $0.hasPrefix(prefix) }
            .map { dir.appendingPathComponent($0) }
    }

    /// A playable `file://` URL string for a file URL (never hand-concatenated).
    private static func fileUrlString(_ url: URL) -> String {
        url.absoluteString
    }

    // MARK: - JS Methods

    @objc func download(_ songId: String, url: String, ext: String, maxBytes: Double, callback: @escaping (String) -> Void) {
        guard let remoteUrl = URL(string: url) else {
            callback("{\"error\":\"Invalid URL\"}")
            return
        }

        let cap = maxBytes.isFinite && maxBytes > 0 ? UInt64(maxBytes) : UInt64.max
        let destDir = Self.cacheDir
        let destFile = destDir.appendingPathComponent(Self.fileName(songId, ext: ext))

        do {
            try FileManager.default.createDirectory(at: destDir, withIntermediateDirectories: true)
        } catch {
            callback("{\"error\":\"\(Self.escapeJson(error.localizedDescription))\"}")
            return
        }

        let task = InsecureTls.shared.session.downloadTask(with: remoteUrl) { tempUrl, _, error in
            if let error = error {
                DispatchQueue.main.async {
                    callback("{\"error\":\"\(Self.escapeJson(error.localizedDescription))\"}")
                }
                return
            }
            guard let tempUrl = tempUrl else {
                DispatchQueue.main.async {
                    callback("{\"error\":\"No data received\"}")
                }
                return
            }
            do {
                // Enforce the byte cap before committing (see the header note).
                let size = (try? FileManager.default.attributesOfItem(atPath: tempUrl.path)[.size] as? UInt64) ?? 0
                if size > cap {
                    try? FileManager.default.removeItem(at: tempUrl)
                    DispatchQueue.main.async {
                        callback("{\"error\":\"\(Self.limitExceededError)\"}")
                    }
                    return
                }
                // Remove any previous copy (move fails otherwise), then commit.
                if FileManager.default.fileExists(atPath: destFile.path) {
                    try FileManager.default.removeItem(at: destFile)
                }
                try FileManager.default.moveItem(at: tempUrl, to: destFile)
                DispatchQueue.main.async {
                    callback("{\"path\":\"\(Self.escapeJson(Self.fileUrlString(destFile)))\"}")
                }
            } catch {
                try? FileManager.default.removeItem(at: tempUrl)
                DispatchQueue.main.async {
                    callback("{\"error\":\"\(Self.escapeJson(error.localizedDescription))\"}")
                }
            }
        }
        task.resume()
    }

    @objc func getCacheInfo(_ songId: String, callback: @escaping (String) -> Void) {
        if let file = Self.findCachedFile(songId) {
            let size = (try? FileManager.default.attributesOfItem(atPath: file.path)[.size] as? UInt64) ?? 0
            callback("{\"cached\":true,\"url\":\"\(Self.escapeJson(Self.fileUrlString(file)))\",\"sizeBytes\":\(size)}")
        } else {
            callback("{\"cached\":false,\"url\":null,\"sizeBytes\":0}")
        }
    }

    @objc func remove(_ songId: String, callback: @escaping (String) -> Void) {
        if let file = Self.findCachedFile(songId) {
            try? FileManager.default.removeItem(at: file)
        }
        callback("{}")
    }

    @objc func getCacheSize(_ callback: @escaping (String) -> Void) {
        let dir = Self.cacheDir
        var totalSize: UInt64 = 0
        if let enumerator = FileManager.default.enumerator(at: dir, includingPropertiesForKeys: [.fileSizeKey], options: [.skipsHiddenFiles]) {
            for case let fileUrl as URL in enumerator {
                // Skip `.part`-style leftovers; only committed files count.
                if fileUrl.lastPathComponent.hasSuffix(".part") { continue }
                if let size = try? fileUrl.resourceValues(forKeys: [.fileSizeKey]).fileSize {
                    totalSize += UInt64(size)
                }
            }
        }
        callback("{\"bytes\":\(totalSize)}")
    }

    @objc func clearAll(_ callback: @escaping (String) -> Void) {
        let dir = Self.cacheDir
        if let entries = try? FileManager.default.contentsOfDirectory(atPath: dir.path) {
            for entry in entries {
                try? FileManager.default.removeItem(at: dir.appendingPathComponent(entry))
            }
        }
        callback("{}")
    }

    // MARK: - Helpers

    private static func escapeJson(_ s: String) -> String {
        s.replacingOccurrences(of: "\\", with: "\\\\")
         .replacingOccurrences(of: "\"", with: "\\\"")
         .replacingOccurrences(of: "\n", with: "\\n")
         .replacingOccurrences(of: "\r", with: "\\r")
         .replacingOccurrences(of: "\t", with: "\\t")
    }
}
