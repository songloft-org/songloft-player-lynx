import AVFoundation
import CoreMedia
import Foundation

@main
struct PluginAudioEffectsSmoke {
  private static let sampleRate = 48_000

  @MainActor
  static func main() async throws {
    guard CommandLine.arguments.count == 2 else {
      fatalError("Pass a scratch directory for the generated WAV files")
    }
    let directory = URL(fileURLWithPath: CommandLine.arguments[1], isDirectory: true)
    let eqTone = directory.appendingPathComponent("eq-tone.wav")
    let bassTone = directory.appendingPathComponent("bass-tone.wav")
    try writeTone(to: eqTone, frequency: 1_000, peak: 0.2)
    try writeTone(to: bassTone, frequency: 62, peak: 0.99)

    let equalizer = AudioEqualizer()
    let flat = try await peak(eqTone, through: equalizer)
    equalizer.setEnabled(true)
    equalizer.setBand(5, gain: 6)
    let boosted = try await peak(eqTone, through: equalizer)
    try require(abs(flat - 0.2) < 0.002 && (0.38...0.41).contains(boosted), "NBandEQ did not process the tap PCM")

    let combined = """
      {"gains":[6,5,4,2,0,0,0,0,0,0],"spatial":{"side":1.5,"dry":0.13,"taps":[{"milliseconds":11,"gain":0.015}]}}
      """
    try require(equalizer.setPluginAudioEffects(combined, available: 7), "Combined profile was rejected")
    let processed = try await peak(bassTone, through: equalizer)
    try require((0.15..<1.0).contains(processed), "Combined output was dry or overloaded")
    try require(equalizer.setPluginAudioEffects("", available: 0), "Clear failed after the tap was released")
    let restored = try await peak(eqTone, through: equalizer)
    try require(abs(restored - boosted) < 0.002, "Clear did not restore user EQ")
    print("AVAudioMix peak amplitudes. Flat:", flat, "EQ:", boosted, "combined:", processed, "restored:", restored)
  }

  private static func writeTone(to url: URL, frequency: Double, peak: Float) throws {
    let format = AVAudioFormat(commonFormat: .pcmFormatFloat32, sampleRate: Double(sampleRate),
                               channels: 2, interleaved: true)!
    let pcm = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: AVAudioFrameCount(sampleRate))!
    pcm.frameLength = AVAudioFrameCount(sampleRate)
    let samples = pcm.floatChannelData!
    for frame in 0..<sampleRate {
      let value = peak * Float(sin(2 * Double.pi * frequency * Double(frame) / Double(sampleRate)))
      samples[0][2 * frame] = value
      samples[0][2 * frame + 1] = -value
    }
    let file = try AVAudioFile(forWriting: url, settings: format.settings,
                              commonFormat: .pcmFormatFloat32, interleaved: true)
    try file.write(from: pcm)
  }

  @MainActor
  private static func peak(_ url: URL, through equalizer: AudioEqualizer) async throws -> Float {
    let asset = AVURLAsset(url: url)
    let tracks = try await asset.loadTracks(withMediaType: .audio)
    guard let track = tracks.first, let mix = equalizer.buildAudioMix(for: track) else {
      throw SmokeError("Could not create the AVAudioMix tap")
    }
    let reader = try AVAssetReader(asset: asset)
    let output = AVAssetReaderAudioMixOutput(audioTracks: [track], audioSettings: [
      AVFormatIDKey: kAudioFormatLinearPCM, AVLinearPCMBitDepthKey: 32,
      AVLinearPCMIsFloatKey: true, AVLinearPCMIsNonInterleaved: false,
      AVSampleRateKey: sampleRate, AVNumberOfChannelsKey: 2,
    ])
    output.audioMix = mix
    reader.add(output)
    try require(reader.startReading(), "AVAssetReader could not start")
    var peak: Float = 0
    var samples = 0
    while let buffer = output.copyNextSampleBuffer(), let block = CMSampleBufferGetDataBuffer(buffer) {
      var bytes: UnsafeMutablePointer<Int8>?
      var length = 0
      let status = CMBlockBufferGetDataPointer(block, atOffset: 0, lengthAtOffsetOut: nil,
                                                totalLengthOut: &length, dataPointerOut: &bytes)
      let sampleSize = MemoryLayout<Float>.stride
      guard status == noErr, let bytes, length % sampleSize == 0 else {
        throw SmokeError("Could not read interleaved float PCM")
      }
      let floats = UnsafeRawPointer(bytes).assumingMemoryBound(to: Float.self)
      let count = length / sampleSize
      for index in 0..<count { peak = max(peak, abs(floats[index])) }
      samples += count
    }
    try require(reader.status == .completed && samples == 2 * sampleRate, "PCM sample count changed")
    return peak
  }

  private static func require(_ condition: Bool, _ message: String) throws {
    if !condition { throw SmokeError(message) }
  }

  private struct SmokeError: Error, CustomStringConvertible {
    let description: String
    init(_ description: String) { self.description = description }
  }
}
