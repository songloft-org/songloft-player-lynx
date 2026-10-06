import Foundation

/// Original five-method ABI plus optional v2 indexed cache; one durable serial writer.
final class SongloftSongCacheModule: NSObject, LynxContextModule {
  private weak var context: LynxContext?
  private static let reads = DispatchQueue(label: "org.songloft.cache.reads")
  private static let store: Result<SongCacheStore, Error> = Result {
    let documents = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
    return try SongCacheStore(root: documents.appendingPathComponent("song_cache", isDirectory: true),
      trustChallenge: { InsecureTls.shared.handle($0) })
  }
  @objc static var name: String { "SongloftSongCache" }
  @objc static var methodLookup: [String: String] {
    [
      "getCacheContract": NSStringFromSelector(#selector(SongloftSongCacheModule.getCacheContract(_:))),
      "cacheEntry": NSStringFromSelector(#selector(SongloftSongCacheModule.cacheEntry(_:callback:))),
      "getEntry": NSStringFromSelector(#selector(SongloftSongCacheModule.getEntry(_:callback:))),
      "listEntries": NSStringFromSelector(#selector(SongloftSongCacheModule.listEntries(_:callback:))),
      "removeEntry": NSStringFromSelector(#selector(SongloftSongCacheModule.removeEntry(_:callback:))),
      "clearNamespace": NSStringFromSelector(#selector(SongloftSongCacheModule.clearNamespace(_:callback:))),
      "clearLegacy": NSStringFromSelector(#selector(SongloftSongCacheModule.clearLegacy(_:))),
      "getTasks": NSStringFromSelector(#selector(SongloftSongCacheModule.getTasks(_:))),
      "cancelTask": NSStringFromSelector(#selector(SongloftSongCacheModule.cancelTask(_:))),
      "download": NSStringFromSelector(#selector(SongloftSongCacheModule.download(_:url:ext:maxBytes:callback:))),
      "getCacheInfo": NSStringFromSelector(#selector(SongloftSongCacheModule.getCacheInfo(_:callback:))),
      "remove": NSStringFromSelector(#selector(SongloftSongCacheModule.remove(_:callback:))),
      "getCacheSize": NSStringFromSelector(#selector(SongloftSongCacheModule.getCacheSize(_:))),
      "clearAll": NSStringFromSelector(#selector(SongloftSongCacheModule.clearAll(_:))),
    ]
  }
  @objc(initWithParam:)
  convenience init(param: Any) { self.init(context: nil) }
  @objc(initWithLynxContext:)
  convenience init(lynxContext context: LynxContext) { self.init(context: context) }
  @objc(initWithLynxContext:WithParam:)
  convenience init(lynxContext context: LynxContext, withParam param: Any) { self.init(context: context) }
  override init() { super.init() }
  private init(context: LynxContext?) { self.context = context; super.init() }
  private func reply(_ callback: @escaping (String) -> Void, _ value: [String: Any]) {
    let raw = (try? SongCacheStore.encode(value)).map { String(decoding: $0, as: UTF8.self) } ?? "{\"error\":\"cache_storage_unavailable\"}"
    DispatchQueue.main.async { callback(raw) }
  }
  private func read(_ callback: @escaping (String) -> Void, _ action: @escaping (SongCacheStore) throws -> [String: Any]) {
    Self.reads.async {
      do { self.reply(callback, try action(Self.store.get())) }
      catch { self.reply(callback, SongCacheStore.failure(error)) }
    }
  }
  private func write(_ callback: @escaping (String) -> Void, _ action: @escaping (SongCacheStore, @escaping ([String: Any]) -> Void) throws -> Void) {
    Self.reads.async {
      do { try action(Self.store.get(), { self.reply(callback, $0) }) }
      catch { self.reply(callback, SongCacheStore.failure(error)) }
    }
  }
  private func progress(_ value: [String: Any]) {
    DispatchQueue.main.async { [weak self] in self?.context?.sendGlobalEvent("songCacheProgress", withParams: [value]) }
  }
  @objc func getCacheContract(_ callback: @escaping (String) -> Void) { reply(callback, ["version": 2]) }
  @objc func cacheEntry(_ request: String, callback: @escaping (String) -> Void) {
    write(callback) { store, finish in store.cacheEntry(request, progress: { [weak self] in self?.progress($0) }, callback: finish) }
  }
  @objc func getEntry(_ request: String, callback: @escaping (String) -> Void) { read(callback) { try $0.getEntry(request) } }
  @objc func listEntries(_ request: String, callback: @escaping (String) -> Void) { read(callback) { try $0.listEntries(request) } }
  @objc func removeEntry(_ request: String, callback: @escaping (String) -> Void) { write(callback) { $0.remove(request, callback: $1) } }
  @objc func clearNamespace(_ request: String, callback: @escaping (String) -> Void) {
    write(callback) { store, finish in
      guard let value = try JSONSerialization.jsonObject(with: Data(request.utf8)) as? [String: Any], let namespace = value["namespace"] as? String else {
        throw SongCacheStore.Failure(code: "invalid_cache_request")
      }
      store.clearNamespace(namespace, callback: finish)
    }
  }
  @objc func clearLegacy(_ callback: @escaping (String) -> Void) { write(callback) { $0.clearLegacy($1) } }
  @objc func getTasks(_ callback: @escaping (String) -> Void) { read(callback) { $0.getTasks() } }
  @objc func cancelTask(_ taskId: String) { (try? Self.store.get())?.cancel(taskId) }
  @objc func download(_ songId: String, url: String, ext: String, maxBytes: Double, callback: @escaping (String) -> Void) {
    write(callback) { $0.legacyDownload(songId, url: url, ext: ext, maximum: maxBytes, callback: $1) }
  }
  @objc func getCacheInfo(_ songId: String, callback: @escaping (String) -> Void) { read(callback) { $0.legacyInfo(songId) } }
  @objc func remove(_ songId: String, callback: @escaping (String) -> Void) { write(callback) { $0.legacyRemove(songId, callback: $1) } }
  @objc func getCacheSize(_ callback: @escaping (String) -> Void) { read(callback) { ["bytes": $0.size()] } }
  @objc func clearAll(_ callback: @escaping (String) -> Void) { write(callback) { $0.clearAll($1) } }
}
