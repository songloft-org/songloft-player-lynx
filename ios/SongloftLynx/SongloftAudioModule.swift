import Foundation

/**
 * Lynx native module `NativeModules.SongloftAudio` — the iOS audio backend
 * (AVPlayer, see [SongloftAudioEngine]), replacing the batch-5 TS mock behind
 * the same facade. The iOS counterpart of
 * `org.songloft.lynx.audio.SongloftAudioModule`; registered on the `LynxConfig`
 * in `ViewController` (Android registers on `LynxEnv` in `SongloftApplication`).
 *
 * The method + event contract is **identical to the TS mock and to Kotlin**
 * (`src/native/audio-types.ts`), so the facade switch is transparent to the
 * player store: `load`/`play`/`pause`/`stop`/`seek`/`setVolume`/`setSpeed` plus
 * queue methods (queue is JS-store-driven — `next`/`previous`/`setRepeatMode`/
 * `setShuffle` are deliberate no-ops here, exactly as on Android) plus
 * equalizer stubs.
 *
 * Conforms to `LynxContextModule` (not just `LynxModule`) purely to get the
 * `LynxContext`, which is the only way to push events into the page:
 * `sendGlobalEvent` → BTS `GlobalEventEmitter` → the facade's listeners.
 */
final class SongloftAudioModule: NSObject, LynxContextModule {
  // MARK: - LynxModule

  /// Must match the key the TS facade probes (`NativeModules.SongloftAudio`).
  @objc static var name: String { "SongloftAudio" }

  /**
   * JS method name → ObjC selector. There is no `@LynxMethod`-style annotation
   * on iOS: anything missing here is simply absent on the JS object, and
   * `isNativeAudioAvailable` then rejects the whole module and silently falls
   * back to the timer-driven mock (audio "works" but nothing ever plays). Keep
   * in sync with `SongloftAudioNativeModule` in `native-audio.ts`.
   */
  @objc static var methodLookup: [String: String] {
    [
      "load": NSStringFromSelector(#selector(SongloftAudioModule.load(_:opts:))),
      "getSourceLoadVersion": NSStringFromSelector(#selector(SongloftAudioModule.getSourceLoadVersion(_:))),
      "play": NSStringFromSelector(#selector(SongloftAudioModule.play)),
      "pause": NSStringFromSelector(#selector(SongloftAudioModule.pause)),
      "stop": NSStringFromSelector(#selector(SongloftAudioModule.stop)),
      "seek": NSStringFromSelector(#selector(SongloftAudioModule.seek(_:))),
      "setVolume": NSStringFromSelector(#selector(SongloftAudioModule.setVolume(_:))),
      "setSpeed": NSStringFromSelector(#selector(SongloftAudioModule.setSpeed(_:))),
      "setQueue": NSStringFromSelector(#selector(SongloftAudioModule.setQueue(_:startIndex:))),
      "next": NSStringFromSelector(#selector(SongloftAudioModule.next)),
      "previous": NSStringFromSelector(#selector(SongloftAudioModule.previous)),
      "setRepeatMode": NSStringFromSelector(#selector(SongloftAudioModule.setRepeatMode(_:))),
      "setShuffle": NSStringFromSelector(#selector(SongloftAudioModule.setShuffle(_:))),
      "setFavorite": NSStringFromSelector(#selector(SongloftAudioModule.setFavorite(_:))),
      "setEqualizerEnabled":
        NSStringFromSelector(#selector(SongloftAudioModule.setEqualizerEnabled(_:))),
      "setEqualizerBand":
        NSStringFromSelector(#selector(SongloftAudioModule.setEqualizerBand(_:gainDb:))),
      "updateNotificationLyric":
        NSStringFromSelector(#selector(SongloftAudioModule.updateNotificationLyric(_:))),
      "updateNotificationLyricWithLayout":
        NSStringFromSelector(#selector(SongloftAudioModule.updateNotificationLyricWithLayout(_:inTitle:))),
      "getVolume": NSStringFromSelector(#selector(SongloftAudioModule.getVolume)),
      "dispose": NSStringFromSelector(#selector(SongloftAudioModule.dispose)),
    ]
  }

  /// Weak: the context is owned by the LynxView that created this module, and a
  /// strong reference here would close a retain cycle through the JS runtime.
  private weak var context: LynxContext?

  /**
   * Designated initializer. The context is optional here even though the
   * protocol declares it nonnull, because the runtime resolves it itself
   * (`CommonModuleCreator::Create`) and passes nil when it cannot find one.
   */
  private init(context: LynxContext?) {
    self.context = context
    super.init()
    // Install this module as the engine's event sink. Assigning (rather than
    // adding) mirrors Kotlin's `SongloftAudioEngine.sink = this`: the newest
    // module instance owns delivery, so a reloaded page cannot be fed by a
    // stale context.
    SongloftAudioEngine.shared.sink = { [weak self] event, payload in
      // `sendGlobalEvent(name, [payload])` delivers the array's first element as
      // the listener's first argument — the contract `mapGlobalEvent` decodes.
      self?.context?.sendGlobalEvent(event, withParams: [payload])
    }
  }

  /// The one the runtime actually calls for a `LynxContextModule`. The signature
  /// must match the protocol exactly — `LynxContext?` or an IUO does not satisfy
  /// the imported requirement.
  @objc(initWithLynxContext:)
  convenience init(lynxContext context: LynxContext) {
    self.init(context: context)
  }

  /**
   * The remaining three exist purely to satisfy the protocol: Swift cannot
   * represent ObjC `@optional` **initializer** requirements, so it demands every
   * one of them — including the `init()` that declaring an initializer of our own
   * withdrew. None is reachable in this app (nothing registers a `param:`), and a
   * module built without a context would simply emit no events rather than crash.
   */
  @objc(initWithLynxContext:WithParam:)
  convenience init(lynxContext context: LynxContext, withParam param: Any) {
    self.init(context: context)
  }

  @objc(initWithParam:)
  convenience init(param: Any) {
    self.init(context: nil)
  }

  override convenience init() {
    self.init(context: nil)
  }

  // MARK: - Source & transport

  @objc func getSourceLoadVersion(_ callback: @escaping LynxCallbackBlock) {
    callback([1] as NSArray)
  }

  @objc func load(_ url: String, opts: [AnyHashable: Any]?) {
    let hls = (opts?["hls"] as? NSNumber)?.boolValue ?? false
    let headers = opts?["headers"] as? [String: String]
    let sourceId = opts?["sourceId"] as? String
    let positionMs = (opts?["initialPositionMs"] as? NSNumber)?.doubleValue ?? 0
    let autoplay = (opts?["autoplay"] as? NSNumber)?.boolValue ?? false
    let engine = SongloftAudioEngine.shared
    engine.runOnMain {
      engine.load(url: url, hls: hls, headers: headers, sourceId: sourceId,
                  initialPositionMs: positionMs, autoplay: autoplay)
    }
  }

  @objc func play() {
    let engine = SongloftAudioEngine.shared
    engine.runOnMain { engine.play() }
  }

  @objc func pause() {
    let engine = SongloftAudioEngine.shared
    engine.runOnMain { engine.pause() }
  }

  @objc func stop() {
    let engine = SongloftAudioEngine.shared
    engine.runOnMain { engine.stop() }
  }

  @objc func seek(_ positionMs: Double) {
    let engine = SongloftAudioEngine.shared
    engine.runOnMain { engine.seek(positionMs: positionMs) }
  }

  @objc func setVolume(_ volume: Double) {
    let engine = SongloftAudioEngine.shared
    engine.runOnMain { engine.setVolume(Float(volume)) }
  }

  @objc func setSpeed(_ rate: Double) {
    let engine = SongloftAudioEngine.shared
    engine.runOnMain { engine.setSpeed(Float(rate)) }
  }

  // MARK: - Queue (JS-store-driven, mirrors the mock)

  @objc func setQueue(_ items: [Any]?, startIndex: Double) {
    // The JS store owns the queue and calls load()/play() per track; we only
    // capture per-track metadata so the lock screen has content.
    let metadata = Self.parseQueueMetadata(items)
    let engine = SongloftAudioEngine.shared
    engine.runOnMain { engine.setQueueMetadata(metadata) }
  }

  @objc func next() {
    // Advancing is decided by the JS store, which then calls load()+play().
  }

  @objc func previous() {
  }

  @objc func setRepeatMode(_ mode: String) {
  }

  @objc func setShuffle(_ on: Bool) {
  }

  // MARK: - Lock-screen favorite button

  @objc func setFavorite(_ isFavorite: Bool) {
    let engine = SongloftAudioEngine.shared
    engine.runOnMain { engine.setFavorite(isFavorite) }
  }

  // MARK: - Notification lyric & volume

  @objc func updateNotificationLyric(_ lyric: String?) {
    let engine = SongloftAudioEngine.shared
    engine.runOnMain { engine.updateNotificationLyric(lyric) }
  }

  @objc func updateNotificationLyricWithLayout(_ lyric: String?, inTitle: Bool) {
    let engine = SongloftAudioEngine.shared
    engine.runOnMain { engine.updateNotificationLyric(lyric, inTitle: inTitle) }
  }

  @objc func getVolume() {
    let engine = SongloftAudioEngine.shared
    engine.runOnMain { engine.getVolume() }
  }

  // MARK: - Equalizer (10-band via MTAudioProcessingTap + kAudioUnitSubType_NBandEQ)

  @objc func setEqualizerEnabled(_ on: Bool) {
    let engine = SongloftAudioEngine.shared
    engine.runOnMain { engine.equalizer.setEnabled(on) }
  }

  @objc func setEqualizerBand(_ index: Double, gainDb: Double) {
    let engine = SongloftAudioEngine.shared
    engine.runOnMain { engine.equalizer.setBand(Int(index), gain: Float(gainDb)) }
  }

  // MARK: - Lifecycle

  @objc func dispose() {
    let engine = SongloftAudioEngine.shared
    engine.runOnMain { engine.release() }
  }

  // MARK: - Helpers

  /// Parse the JS queue (`AudioItem[]`) into lock-screen metadata entries.
  private static func parseQueueMetadata(_ items: [Any]?) -> [QueueMetadata] {
    guard let items else { return [] }
    return items.compactMap { entry in
      guard let map = entry as? [AnyHashable: Any],
            let url = map["url"] as? String, !url.isEmpty
      else { return nil }
      return QueueMetadata(
        url: url,
        title: map["title"] as? String,
        artist: map["artist"] as? String,
        artworkUrl: map["artworkUrl"] as? String
      )
    }
  }
}
