import Foundation

/**
 * Song audio file caching module.
 * Exposed to JS as `NativeModules.SongloftSongCache`.
 *
 * Downloads audio files to the app's Caches directory so they can be played
 * offline or without re-fetching. Uses `InsecureTls.shared.session` so that
 * self-signed Songloft servers are reachable.
 */
final class SongloftSongCacheModule: NSObject, LynxModule {
    @objc required init(param: Any) {}
    override init() { super.init() }

    @objc static var name: String { "SongloftSongCache" }

    @objc static var methodLookup: [String: String] {
        [
            "download": NSStringFromSelector(#selector(SongloftSongCacheModule.download(_:url:callback:))),
            "getCachedPath": NSStringFromSelector(#selector(SongloftSongCacheModule.getCachedPath(_:callback:))),
            "remove": NSStringFromSelector(#selector(SongloftSongCacheModule.remove(_:callback:))),
            "getCacheSize": NSStringFromSelector(#selector(SongloftSongCacheModule.getCacheSize(_:))),
        ]
    }

    private static var cacheDir: URL {
        let caches = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
        return caches.appendingPathComponent("song_cache", isDirectory: true)
    }

    // MARK: - JS Methods

    @objc func download(_ songId: String, url: String, callback: @escaping (String) -> Void) {
        guard let remoteUrl = URL(string: url) else {
            callback("{\"error\":\"Invalid URL\"}")
            return
        }

        let destDir = Self.cacheDir
        let destFile = destDir.appendingPathComponent(songId)

        // Ensure directory exists
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
                // Remove existing file if present (move fails otherwise)
                if FileManager.default.fileExists(atPath: destFile.path) {
                    try FileManager.default.removeItem(at: destFile)
                }
                try FileManager.default.moveItem(at: tempUrl, to: destFile)
                DispatchQueue.main.async {
                    callback("{\"path\":\"\(Self.escapeJson(destFile.path))\"}")
                }
            } catch {
                DispatchQueue.main.async {
                    callback("{\"error\":\"\(Self.escapeJson(error.localizedDescription))\"}")
                }
            }
        }
        task.resume()
    }

    @objc func getCachedPath(_ songId: String, callback: @escaping (String) -> Void) {
        let file = Self.cacheDir.appendingPathComponent(songId)
        if FileManager.default.fileExists(atPath: file.path) {
            callback("{\"path\":\"\(Self.escapeJson(file.path))\"}")
        } else {
            callback("{\"path\":null}")
        }
    }

    @objc func remove(_ songId: String, callback: @escaping (String) -> Void) {
        let file = Self.cacheDir.appendingPathComponent(songId)
        try? FileManager.default.removeItem(at: file)
        callback("{}")
    }

    @objc func getCacheSize(_ callback: @escaping (String) -> Void) {
        let dir = Self.cacheDir
        var totalSize: UInt64 = 0
        if let enumerator = FileManager.default.enumerator(at: dir, includingPropertiesForKeys: [.fileSizeKey], options: [.skipsHiddenFiles]) {
            for case let fileUrl as URL in enumerator {
                if let size = try? fileUrl.resourceValues(forKeys: [.fileSizeKey]).fileSize {
                    totalSize += UInt64(size)
                }
            }
        }
        callback("{\"bytes\":\(totalSize)}")
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
