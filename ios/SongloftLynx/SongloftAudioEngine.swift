import AVFoundation
import MediaPlayer
import UIKit

/**
 * Process-wide audio engine backing [SongloftAudioModule] — the iOS counterpart
 * of `org.songloft.lynx.audio.SongloftAudioEngine` (ExoPlayer + media3
 * MediaSession + foreground service on Android).
 *
 * Event payloads and the state vocabulary are **identical to the TS mock**
 * (`src/native/audio-types.ts`) and to the Kotlin engine, because the facade
 * (`native-audio.ts`) decodes all three with the same `mapGlobalEvent`:
 *   - stateChanged: { state: idle|loading|ready|playing|paused|completed|error }
 *   - progress:     { positionMs, bufferedMs, durationMs }
 *   - error:        { code, message }
 *   - remoteCommand:{ command: next|previous|toggleFavorite }
 *
 * **Architecture differences from Android worth knowing:**
 *
 *  - There is no service to host the player. Background playback is granted by
 *    `UIBackgroundModes: audio` in Info.plist plus an active `AVAudioSession`
 *    with the `.playback` category — that pair replaces Android's
 *    `MediaSessionService` + `startForegroundService`.
 *  - Lock-screen / Control-Center UI comes from `MPNowPlayingInfoCenter`
 *    (metadata) and `MPRemoteCommandCenter` (buttons), not from a notification
 *    the app builds. Consequently the favorite button is `likeCommand` rather
 *    than a custom command with a drawable: iOS does not let an app put an
 *    arbitrary button in the now-playing UI, so `setFavorite` only flips
 *    `likeCommand.isActive` (surfaced in CarPlay / some accessories) instead of
 *    swapping a filled/outline icon.
 *  - HLS needs no special branch: `AVPlayer` picks the right pipeline from the
 *    URL/content type, where ExoPlayer needs an explicit `HlsMediaSource`. The
 *    `hls` flag is therefore accepted and ignored.
 *
 * `AVPlayer` and its KVO/notification callbacks are main-thread affine while all
 * Lynx `@LynxMethod` calls arrive on the background (BTS) thread, so every entry
 * point is funnelled through [runOnMain] — same rule as the Kotlin engine.
 */
final class SongloftAudioEngine {
  static let shared = SongloftAudioEngine()

  /// Event names must byte-for-byte match the TS listeners in `native-audio.ts`
  /// (and the Kotlin `EVENT_*` constants).
  static let eventState = "SongloftAudio.stateChanged"
  static let eventProgress = "SongloftAudio.progress"
  static let eventError = "SongloftAudio.error"
  static let eventRemoteCommand = "SongloftAudio.remoteCommand"

  /// `remoteCommand` payload values — byte-for-byte the TS `RemoteCommand` union.
  static let remoteCommandNext = "next"
  static let remoteCommandPrevious = "previous"
  static let remoteCommandToggleFavorite = "toggleFavorite"

  /// Progress tick cadence, matching the Kotlin engine's `PROGRESS_INTERVAL_MS`.
  private static let progressIntervalSeconds = 0.5

  /// Installed by the module; forwards events to `LynxContext.sendGlobalEvent`.
  var sink: ((String, [String: Any]) -> Void)?

  private var player: AVPlayer?
  private var timeObserver: Any?
  private var itemStatusObservation: NSKeyValueObservation?
  private var timeControlObservation: NSKeyValueObservation?
  private var endObserver: NSObjectProtocol?

  /// url → notification metadata, populated from the JS store's `setQueue`.
  private var metadataByURL: [String: QueueMetadata] = [:]
  private var currentURL: String?

  /// Artwork URL → decoded lock-screen image. Keyed by artwork URL rather than by
  /// song so re-queueing the same track never re-downloads, and deliberately not
  /// cleared by `setQueueMetadata` for the same reason.
  private var artworkCache: [String: MPMediaItemArtwork] = [:]
  /// Artwork URLs with a fetch in flight — `updateNowPlaying()` runs on every
  /// progress tick, so without this a slow download would be started ~2×/second.
  private var artworkInFlight: Set<String> = []

  /// Playback rate the JS store asked for; re-applied on every `play()` because
  /// `AVPlayer.rate` is reset to 1.0 whenever playback restarts.
  private var speed: Float = 1.0
  private var isFavorite = false
  private var remoteCommandsInstalled = false

  /// 10-band parametric EQ, attached to each AVPlayerItem via MTAudioProcessingTap.
  let equalizer = AudioEqualizer()
  /// Set when the current item played to its end, so the `rate → 0` that follows
  /// does not emit a spurious `paused` after `completed` (same guard as Kotlin's
  /// `playbackState != STATE_ENDED` check).
  private var reachedEnd = false

  private init() {}

  /// Run `block` on the main thread (immediately if already there).
  func runOnMain(_ block: @escaping () -> Void) {
    if Thread.isMainThread {
      block()
    } else {
      DispatchQueue.main.async(execute: block)
    }
  }

  // MARK: - Source & transport (main thread)

  /**
   * Replace the queue metadata (url → title/artist/artwork) so the lock screen
   * has content. Playback itself stays one-item-at-a-time driven by the JS
   * store (same as the mock and the Android engine).
   */
  func setQueueMetadata(_ items: [QueueMetadata]) {
    metadataByURL.removeAll()
    for item in items where !item.url.isEmpty {
      metadataByURL[item.url] = item
    }
  }

  func load(url: String, hls: Bool, headers: [String: String]?) {
    activateSession()
    installRemoteCommands()
    let player = ensurePlayer()
    reachedEnd = false
    currentURL = url
    emitState("loading")

    guard let assetURL = URL(string: url) else {
      emit(Self.eventError, ["code": "ERROR_INVALID_URL", "message": "invalid media url"])
      emitState("error")
      return
    }

    var options: [String: Any] = [:]
    if let headers, !headers.isEmpty {
      // Undocumented-but-stable key; the only way to attach request headers to
      // an AVURLAsset (Android's equivalent is DefaultHttpDataSource.Factory
      // .setDefaultRequestProperties). Unused today — the player store sends no
      // headers because `buildSongUrl` already carries auth.
      options["AVURLAssetHTTPHeaderFieldsKey"] = headers
    }
    let asset = AVURLAsset(url: assetURL, options: options)
    // Lets a self-signed media stream play — best-effort, see `attachIfNeeded`.
    InsecureTls.shared.attachIfNeeded(to: asset)
    let item = AVPlayerItem(asset: asset)
    if let mix = equalizer.buildAudioMix(for: item) {
      item.audioMix = mix
    }
    observe(item: item)
    player.replaceCurrentItem(with: item)
    updateNowPlaying()
  }

  func play() {
    let player = ensurePlayer()
    activateSession()
    reachedEnd = false
    // `playImmediately(atRate:)` both starts playback and re-applies the speed
    // the store selected, which a plain `play()` would reset to 1.0.
    player.playImmediately(atRate: speed)
    updateNowPlaying()
  }

  func pause() {
    player?.pause()
    updateNowPlaying()
  }

  func stop() {
    player?.pause()
    player?.replaceCurrentItem(with: nil)
    currentURL = nil
    reachedEnd = false
    MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
    emitState("idle")
    emitProgressValues(positionMs: 0, bufferedMs: 0, durationMs: 0)
  }

  func seek(positionMs: Double) {
    guard let player else { return }
    let target = CMTime(seconds: max(0, positionMs) / 1000, preferredTimescale: 600)
    // Zero tolerance: the seek bar must land where the user dropped it, not on
    // the nearest keyframe.
    player.seek(to: target, toleranceBefore: .zero, toleranceAfter: .zero) { [weak self] _ in
      self?.emitProgress()
      self?.updateNowPlaying()
    }
  }

  func setVolume(_ volume: Float) {
    player?.volume = min(max(volume, 0), 1)
  }

  func setSpeed(_ rate: Float) {
    speed = min(max(rate, 0.5), 3)
    // Only touch `rate` while playing — assigning it to a paused player would
    // start playback.
    if let player, player.timeControlStatus == .playing { player.rate = speed }
    updateNowPlaying()
  }

  /**
   * Push the current track's favorite state from JS (after a successful
   * add/remove against the favorites playlist). Android swaps the notification
   * button icon; iOS can only mark `likeCommand` active.
   */
  func setFavorite(_ value: Bool) {
    isFavorite = value
    let like = MPRemoteCommandCenter.shared().likeCommand
    like.isActive = value
    like.localizedTitle = value ? "取消收藏" : "收藏"
  }

  /// Full teardown — called by the module's `dispose()`.
  func release() {
    if let player, let timeObserver {
      player.removeTimeObserver(timeObserver)
    }
    timeObserver = nil
    itemStatusObservation = nil
    timeControlObservation = nil
    if let endObserver {
      NotificationCenter.default.removeObserver(endObserver)
    }
    endObserver = nil
    player?.pause()
    player?.replaceCurrentItem(with: nil)
    player = nil
    currentURL = nil
    MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
    try? AVAudioSession.sharedInstance().setActive(false)
  }

  // MARK: - Player lifecycle

  private func ensurePlayer() -> AVPlayer {
    if let player { return player }
    let created = AVPlayer()
    created.automaticallyWaitsToMinimizeStalling = true
    timeControlObservation = created.observe(\.timeControlStatus, options: [.new]) {
      [weak self] player, _ in
      self?.onTimeControlStatus(of: player)
    }
    timeObserver = created.addPeriodicTimeObserver(
      forInterval: CMTime(seconds: Self.progressIntervalSeconds, preferredTimescale: 600),
      queue: .main
    ) { [weak self] _ in
      self?.emitProgress()
    }
    player = created
    return created
  }

  /**
   * `.playback` keeps audio going when the screen locks and when the app is
   * backgrounded (together with `UIBackgroundModes: audio`), and — unlike the
   * default `.soloAmbient` category — ignores the ring/silent switch. Without
   * this, playback stops the moment the app leaves the foreground.
   */
  private func activateSession() {
    let session = AVAudioSession.sharedInstance()
    try? session.setCategory(.playback, mode: .default)
    try? session.setActive(true)
  }

  private func observe(item: AVPlayerItem) {
    itemStatusObservation = item.observe(\.status, options: [.new]) { [weak self] item, _ in
      self?.onItemStatus(of: item)
    }
    if let endObserver {
      NotificationCenter.default.removeObserver(endObserver)
    }
    endObserver = NotificationCenter.default.addObserver(
      forName: AVPlayerItem.didPlayToEndTimeNotification,
      object: item,
      queue: .main
    ) { [weak self] _ in
      self?.onReachedEnd()
    }
  }

  // MARK: - Player state → facade events

  private func onItemStatus(of item: AVPlayerItem) {
    switch item.status {
    case .readyToPlay:
      emitState("ready")
      updateNowPlaying()
    case .failed:
      let error = item.error as NSError?
      emit(
        Self.eventError,
        [
          "code": error.map { "\($0.domain):\($0.code)" } ?? "ERROR_UNKNOWN",
          "message": error?.localizedDescription ?? "playback error",
        ]
      )
      emitState("error")
    default:
      break
    }
  }

  private func onTimeControlStatus(of player: AVPlayer) {
    switch player.timeControlStatus {
    case .playing:
      emitState("playing")
    case .waitingToPlayAtSpecifiedRate:
      // Stalled / buffering — the same condition Android reports as
      // `Player.STATE_BUFFERING` → `loading`.
      emitState("loading")
    case .paused:
      // Natural end already emitted `completed`; don't follow it with `paused`.
      if !reachedEnd { emitState("paused") }
    @unknown default:
      break
    }
    updateNowPlaying()
  }

  private func onReachedEnd() {
    reachedEnd = true
    emitProgress()
    emitState("completed")
  }

  // MARK: - Events

  private func emit(_ event: String, _ payload: [String: Any]) {
    sink?(event, payload)
  }

  private func emitState(_ state: String) {
    emit(Self.eventState, ["state": state])
  }

  private func emitProgress() {
    guard let item = player?.currentItem else { return }
    let buffered = item.loadedTimeRanges.last?.timeRangeValue
    emitProgressValues(
      positionMs: Self.milliseconds(item.currentTime()),
      bufferedMs: buffered.map { Self.milliseconds($0.start + $0.duration) } ?? 0,
      durationMs: Self.milliseconds(item.duration)
    )
  }

  private func emitProgressValues(positionMs: Double, bufferedMs: Double, durationMs: Double) {
    emit(
      Self.eventProgress,
      ["positionMs": positionMs, "bufferedMs": bufferedMs, "durationMs": durationMs]
    )
  }

  /// `CMTime` → ms, collapsing `indefinite` / `NaN` (live streams, not-yet-known
  /// durations) to 0 — the same normalisation Kotlin does for `C.TIME_UNSET`.
  private static func milliseconds(_ time: CMTime) -> Double {
    let seconds = CMTimeGetSeconds(time)
    return seconds.isFinite && seconds > 0 ? seconds * 1000 : 0
  }

  // MARK: - Lock screen / Control Center

  private func updateNowPlaying() {
    guard let player, let item = player.currentItem else {
      MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
      return
    }
    let metadata = currentURL.flatMap { metadataByURL[$0] }
    var info: [String: Any] = [
      MPNowPlayingInfoPropertyElapsedPlaybackTime: CMTimeGetSeconds(item.currentTime()),
      MPNowPlayingInfoPropertyPlaybackRate: player.rate,
      MPNowPlayingInfoPropertyMediaType: MPNowPlayingInfoMediaType.audio.rawValue,
    ]
    if let title = metadata?.title { info[MPMediaItemPropertyTitle] = title }
    if let artist = metadata?.artist { info[MPMediaItemPropertyArtist] = artist }
    let duration = Self.milliseconds(item.duration) / 1000
    if duration > 0 { info[MPMediaItemPropertyPlaybackDuration] = duration }
    if let artworkUrl = metadata?.artworkUrl, !artworkUrl.isEmpty {
      if let artwork = artworkCache[artworkUrl] {
        info[MPMediaItemPropertyArtwork] = artwork
      } else {
        fetchArtwork(artworkUrl)
      }
    }
    MPNowPlayingInfoCenter.default().nowPlayingInfo = info
  }

  /**
   * Download and decode one artwork image, then re-run [updateNowPlaying].
   *
   * Re-running is not laziness: [updateNowPlaying] rebuilds `info` from scratch
   * and assigns the whole dictionary, so poking `nowPlayingInfo` directly here
   * would be erased by the very next progress tick. Going back through it also
   * means the artwork gets picked up by whichever of the seven call sites fires
   * next, with no separate "is the artwork ready" state to keep in sync.
   *
   * Fetched via `InsecureTls.session` because the cover lives on the same server
   * as the audio — for a self-signed host, `URLSession.shared` would fail here
   * while playback itself worked.
   */
  private func fetchArtwork(_ artworkUrl: String) {
    guard !artworkInFlight.contains(artworkUrl), let url = URL(string: artworkUrl) else { return }
    artworkInFlight.insert(artworkUrl)

    InsecureTls.shared.session.dataTask(with: url) { [weak self] data, _, _ in
      guard let self else { return }
      let image = data.flatMap { UIImage(data: $0) }
      self.runOnMain {
        self.artworkInFlight.remove(artworkUrl)
        guard let image else { return }
        self.artworkCache[artworkUrl] = MPMediaItemArtwork(boundsSize: image.size) { _ in image }
        // The track may have changed while this was downloading; only refresh if
        // the finished image still belongs to what is playing. It stays cached
        // either way, so coming back to that track is instant.
        let playingArtwork = self.currentURL.flatMap { self.metadataByURL[$0] }?.artworkUrl
        if playingArtwork == artworkUrl {
          self.updateNowPlaying()
        }
      }
    }.resume()
  }

  /**
   * Remote (lock screen / headset / CarPlay) commands. `next` / `previous` /
   * `like` are **forwarded to JS** rather than handled here, because the JS
   * store owns the queue and the favorites API — the same split as Android,
   * where `RemoteCommandForwardingPlayer` and the custom favorite command both
   * emit `SongloftAudio.remoteCommand`.
   */
  private func installRemoteCommands() {
    guard !remoteCommandsInstalled else { return }
    remoteCommandsInstalled = true
    let center = MPRemoteCommandCenter.shared()

    center.playCommand.addTarget { [weak self] _ in
      self?.runOnMain { self?.play() }
      return .success
    }
    center.pauseCommand.addTarget { [weak self] _ in
      self?.runOnMain { self?.pause() }
      return .success
    }
    center.togglePlayPauseCommand.addTarget { [weak self] _ in
      self?.runOnMain {
        guard let self else { return }
        if self.player?.timeControlStatus == .playing { self.pause() } else { self.play() }
      }
      return .success
    }
    center.changePlaybackPositionCommand.addTarget { [weak self] event in
      guard let event = event as? MPChangePlaybackPositionCommandEvent else { return .commandFailed }
      self?.runOnMain { self?.seek(positionMs: event.positionTime * 1000) }
      return .success
    }

    center.nextTrackCommand.isEnabled = true
    center.nextTrackCommand.addTarget { [weak self] _ in
      self?.emit(Self.eventRemoteCommand, ["command": Self.remoteCommandNext])
      return .success
    }
    center.previousTrackCommand.isEnabled = true
    center.previousTrackCommand.addTarget { [weak self] _ in
      self?.emit(Self.eventRemoteCommand, ["command": Self.remoteCommandPrevious])
      return .success
    }
    center.likeCommand.isEnabled = true
    center.likeCommand.localizedTitle = isFavorite ? "取消收藏" : "收藏"
    center.likeCommand.addTarget { [weak self] _ in
      self?.emit(Self.eventRemoteCommand, ["command": Self.remoteCommandToggleFavorite])
      return .success
    }
  }
}

/// One queue entry's lock-screen metadata (parsed from the JS `setQueue`).
/// `artworkUrl` mirrors the Kotlin `QueueMetadata` field. Unlike Android — where
/// media3 fetches `MediaMetadata.artworkUri` itself — iOS needs the bytes
/// downloaded and wrapped in an `MPMediaItemArtwork` by hand; see
/// `SongloftAudioEngine.fetchArtwork`.
struct QueueMetadata {
  let url: String
  let title: String?
  let artist: String?
  let artworkUrl: String?
}
