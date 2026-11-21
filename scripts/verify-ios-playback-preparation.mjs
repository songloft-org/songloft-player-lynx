import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

// Compile the actual engine methods against a controlled seek interface. This
// verifies callback ordering, not UIKit/AVFoundation behavior or Apple SDK types.
const root = fileURLToPath(new URL('../', import.meta.url))
const engine = readFileSync(join(root, 'ios/SongloftLynx/SongloftAudioEngine.swift'), 'utf8')
function method(name) {
  const start = engine.indexOf(`func ${name}(`)
  if (start < 0) throw new Error(`Missing ${name}`)
  let end = engine.indexOf('{', start) + 1
  let depth = 1
  for (; depth && end < engine.length; end++) {
    if (engine[end] === '{') depth++
    if (engine[end] === '}') depth--
  }
  if (depth) throw new Error(`Unclosed ${name}`)
  return engine.slice(start, end)
}

const source = `
struct CMTime {
  let seconds: Double
  init(seconds: Double, preferredTimescale: Int) { self.seconds = seconds }
  static let zero = CMTime(seconds: 0, preferredTimescale: 600)
}
final class AVPlayerItem {
  enum Status { case unknown, readyToPlay }
  var status: Status = .unknown
  var duration = CMTime(seconds: 60, preferredTimescale: 600)
}
final class AVPlayer {
  var currentItem: AVPlayerItem? = AVPlayerItem()
  var targets: [Double] = []
  var callbacks: [(Bool) -> Void] = []
  var position = CMTime.zero
  func currentTime() -> CMTime { position }
  func seek(to target: CMTime, toleranceBefore: CMTime, toleranceAfter: CMTime,
            completionHandler: @escaping (Bool) -> Void) {
    targets.append(target.seconds * 1000)
    callbacks.append(completionHandler)
  }
  func complete(_ index: Int, _ finished: Bool) {
    if finished { position = CMTime(seconds: targets[index] / 1000, preferredTimescale: 600) }
    callbacks[index](finished)
  }
}
final class EqualizerProbe {
  private(set) var resets = 0
  func resetPluginSpatialHistory() { resets += 1 }
}
final class Harness {
  let equalizer = EqualizerProbe()
  var player: AVPlayer? = AVPlayer()
  var isPreparingSource = true
  var pendingInitialPositionMs: Double? = 0
  var pendingAutoplay = true
  var loadGeneration = 1
  var initialSeekGeneration = 0
  var events: [String] = []
  var plays = 0
  var pauses = 0
  static let eventError = "error"
  static func milliseconds(_ time: CMTime) -> Double { time.seconds * 1000 }
  func runOnMain(_ action: @escaping () -> Void) { action() }
  func play() { plays += 1 }
  func pause() { pauses += 1 }
  func emitProgress() {}
  func updateNowPlaying() {}
  func emit(_ event: String, _ payload: [String: Any]) { events.append(event) }
  func ready() { seekInitialPosition(of: player!.currentItem!) }
  ${method('seek')}
  ${method('seekInitialPosition')}
}
@main struct Verify {
  static func main() {
    let h = Harness(), p = h.player!
    h.seek(positionMs: 1200)
    precondition(p.targets.isEmpty && h.pendingInitialPositionMs == 1200, "asset seek is buffered")
    h.isPreparingSource = false
    h.seek(positionMs: 5600)
    precondition(p.targets.isEmpty && h.pendingInitialPositionMs == 5600, "not-ready seek is buffered")
    p.currentItem!.status = .readyToPlay
    h.ready()
    h.seek(positionMs: 9000)
    precondition(p.targets == [5600, 9000], "latest seek replaces initial target")
    p.complete(0, false)
    precondition(h.pendingInitialPositionMs == 9000 && h.events.isEmpty && h.plays == 0,
                 "cancelled old seek leaves latest preparation intact")
    p.complete(1, true)
    precondition(h.pendingInitialPositionMs == nil && h.plays == 1 && h.events == ["SongloftAudio.sourceReady"],
                 "only latest seek completes readiness")

    precondition(h.equalizer.resets == 0, "initial positioning starts with a fresh tap")
    h.seek(positionMs: 11000)
    precondition(p.targets == [5600, 9000, 11000] && h.equalizer.resets == 1,
                 "an active seek resets effect history before moving")
    p.complete(2, true)
    precondition(h.equalizer.resets == 2, "seek completion resets effect history again")

    let paused = Harness(), pp = paused.player!
    paused.isPreparingSource = false
    pp.currentItem!.status = .readyToPlay
    paused.ready()
    paused.pendingAutoplay = false
    pp.complete(0, true)
    precondition(paused.plays == 0 && paused.pauses == 1, "pause intent survives seek completion")

    let changed = Harness(), cp = changed.player!
    changed.isPreparingSource = false
    cp.currentItem!.status = .readyToPlay
    changed.ready()
    changed.loadGeneration += 1
    changed.pendingInitialPositionMs = 7000
    cp.complete(0, true)
    precondition(changed.pendingInitialPositionMs == 7000 && changed.events.isEmpty && changed.plays == 0,
                 "stopped or superseded load cannot complete preparation")
    print("PASS: actual seek methods preserve readiness, latest position, pause and load ownership")
  }
}
`

const directory = mkdtempSync(join(tmpdir(), 'songloft-seek-'))
const docker = process.argv.includes('--docker')
const run = (args) => execFileSync(docker ? 'docker' : args[0], docker
  ? ['run', '--rm', '--ulimit', 'core=0', '-v', `${directory}:/checks`, '-w', '/checks', 'swift:6.2', ...args]
  : args.slice(1), { cwd: directory, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
try {
  writeFileSync(join(directory, 'verify.swift'), source)
  run(['swiftc', '-parse-as-library', '-swift-version', '5', 'verify.swift', '-o', 'verify'])
  process.stdout.write(run(['./verify']))
  for (const [name, before, after, message] of [
    ['not-ready', 'isPreparingSource || pendingInitialPositionMs != nil', 'isPreparingSource', 'not-ready seek is buffered'],
    ['stale-seek', 'self.initialSeekGeneration == expectedSeek,', '', 'cancelled old seek leaves latest preparation intact'],
    ['effects-history', 'self?.equalizer.resetPluginSpatialHistory()', '', 'seek completion resets effect history again'],
  ]) {
    if (!source.includes(before)) throw new Error(`Missing mutation point: ${name}`)
    writeFileSync(join(directory, 'verify.swift'), source.replace(before, after))
    run(['swiftc', '-parse-as-library', '-swift-version', '5', 'verify.swift', '-o', 'verify'])
    let rejected = false
    try { run(['./verify']) } catch (error) {
      rejected = String(error.stderr).includes(message)
    }
    if (!rejected) throw new Error(`Verifier missed ${name}`)
    console.info(`PASS: seek verifier rejects ${name} defect`)
  }
} finally {
  rmSync(directory, { recursive: true, force: true })
}
