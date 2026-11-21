import AVFoundation
import AudioToolbox
import MediaToolbox
import Foundation

/**
 * 10-band parametric equalizer using `MTAudioProcessingTap` + Apple's built-in
 * `kAudioUnitSubType_NBandEQ` AudioUnit.
 *
 * Integrates with AVPlayer without replacing the playback pipeline: an
 * `AVAudioMix` with a processing tap is set on each `AVPlayerItem`.
 */
final class AudioEqualizer {
  static let bandCount = 10
  static let frequencies: [Float] = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000]

  private let stateLock = NSLock()
  private var enabled = false
  private var userGains = [Float](repeating: 0, count: bandCount)
  private var pluginProfile = PluginProfile(gains: nil, spatial: nil)
  private weak var currentTap: TapContext?
  private var supported = 0
  private var historyReset = 0

  var pluginCapabilities: Int {
    stateLock.lock()
    defer { stateLock.unlock() }
    return supported
  }

  func setEnabled(_ on: Bool) {
    stateLock.lock()
    enabled = on
    stateLock.unlock()
  }

  func setBand(_ index: Int, gain: Float) {
    guard (0..<Self.bandCount).contains(index), gain.isFinite else { return }
    stateLock.lock()
    userGains[index] = min(max(gain, -12), 12)
    stateLock.unlock()
  }

  func setPluginProfile(_ raw: String, available: Int) -> Bool {
    setPluginAudioEffects(raw, available: available, equalizerOnly: true)
  }

  func setPluginAudioEffects(_ raw: String, available: Int, equalizerOnly: Bool = false) -> Bool {
    var profile = PluginProfile(gains: nil, spatial: nil)
    if !raw.isEmpty {
      guard let decoded = try? JSONDecoder().decode(PluginProfile.self, from: Data(raw.utf8)),
            decoded.gains.map({ $0.count == Self.bandCount &&
              $0.allSatisfy({ $0.isFinite && (-12...12).contains($0) }) }) ?? !equalizerOnly,
            decoded.spatial?.valid ?? true
      else { return false }
      profile = decoded
    }
    if profile.gains != nil && (available & 1) == 0 { return false }
    if let spatial = profile.spatial, equalizerOnly || (available & (spatial.side == 1 ? 2 : 4)) == 0 { return false }
    stateLock.lock()
    pluginProfile = profile
    stateLock.unlock()
    return true
  }

  private struct PluginProfile: Decodable {
    let gains: [Float]?
    let spatial: SpatialProfile?
  }

  struct SpatialProfile: Decodable, Equatable {
    struct Tap: Decodable, Equatable {
      let milliseconds: Double
      let gain: Float
    }
    let side: Float
    let dry: Float
    let taps: [Tap]

    var valid: Bool {
      (1...1.5).contains(side) && (0...1).contains(dry) && taps.count <= 48 &&
        taps.allSatisfy { (1...1000).contains($0.milliseconds) && (-1...1).contains($0.gain) } &&
        (dry + taps.reduce(Float(0)) { $0 + abs($1.gain) }) * side <= 1.00001
    }
  }

  fileprivate func registerTap(_ ctx: TapContext) {
    stateLock.lock()
    currentTap = ctx
    supported = 0
    stateLock.unlock()
  }

  fileprivate func setTapCapabilities(_ capabilities: Int, context: TapContext) {
    stateLock.lock()
    if currentTap === context { supported = capabilities }
    stateLock.unlock()
  }

  func resetPluginSpatialHistory() {
    stateLock.lock()
    historyReset &+= 1
    stateLock.unlock()
  }

  fileprivate func readEffects(_ context: TapContext) {
    guard stateLock.try() else { return }
    let current = currentTap === context
    let gains = current ? pluginProfile.gains ?? (enabled ? userGains : nil) : nil
    let spatial = current ? pluginProfile.spatial : nil
    let reset = historyReset
    stateLock.unlock()
    context.setGains(gains)
    context.setProfile(spatial)
    if context.resetToken != reset {
      context.resetToken = reset
      context.resetHistory()
    }
  }

  /// The caller asynchronously loads this track before entering the main thread.
  func buildAudioMix(for track: AVAssetTrack) -> AVAudioMix? {
    var callbacks = MTAudioProcessingTapCallbacks(
      version: kMTAudioProcessingTapCallbacksVersion_0,
      clientInfo: Unmanaged.passUnretained(self).toOpaque(),
      init: eqTapInit,
      finalize: eqTapFinalize,
      prepare: eqTapPrepare,
      unprepare: eqTapUnprepare,
      process: eqTapProcess
    )

    var tap: MTAudioProcessingTap?
    let status = MTAudioProcessingTapCreate(kCFAllocatorDefault, &callbacks, kMTAudioProcessingTapCreationFlag_PostEffects, &tap)
    guard status == noErr, let tap else { return nil }

    let params = AVMutableAudioMixInputParameters(track: track)
    params.audioTapProcessor = tap

    let mix = AVMutableAudioMix()
    mix.inputParameters = [params]
    return mix
  }

  /// Context passed through the tap's storage pointer.
  class TapContext {
    weak var owner: AudioEqualizer?
    private var equalizer: AVAudioUnitEQ?
    fileprivate var eqInput: AVAudioPCMBuffer?
    private var eqOutput: AVAudioPCMBuffer?
    private var eqGains: [Float]?
    private var renderedFrames: Float64 = 0
    var rate = 0.0
    var channels = 0
    var capacity = 0
    var planar = false
    var cursor = 0
    var writtenFrames = 0
    var resetToken = 0
    var profile: SpatialProfile?
    var offsets = [Int](repeating: 0, count: 48)
    var left: [Float] = []
    var right: [Float] = []

    func prepare(_ format: AudioStreamBasicDescription, maxFrames: CMItemCount) {
      unprepare()
      let channelCount = Int(format.mChannelsPerFrame)
      guard format.mFormatID == kAudioFormatLinearPCM,
            (format.mFormatFlags & kAudioFormatFlagIsFloat) != 0,
            format.mBitsPerChannel == 32, (1...2).contains(channelCount),
            (8000...384000).contains(format.mSampleRate), maxFrames > 0
      else { return }
      rate = format.mSampleRate
      planar = (format.mFormatFlags & kAudioFormatFlagIsNonInterleaved) != 0
      channels = channelCount
      capacity = Int(rate.rounded(.up)) + 1
      left = [Float](repeating: 0, count: capacity)
      right = channels == 2 ? [Float](repeating: 0, count: capacity) : []
      prepareEqualizer(maxFrames: AVAudioFrameCount(maxFrames))
      let spatial = channels == 2 ? 6 : 2
      owner?.setTapCapabilities(spatial | (equalizer != nil ? 1 : 0), context: self)
    }

    func unprepare() {
      owner?.setTapCapabilities(0, context: self)
      if let unit = equalizer?.audioUnit { AudioUnitUninitialize(unit) }
      equalizer = nil
      eqInput = nil
      eqOutput = nil
      eqGains = nil
      renderedFrames = 0
      capacity = 0
      channels = 0
      profile = nil
      cursor = 0
      writtenFrames = 0
    }

    private func prepareEqualizer(maxFrames: AVAudioFrameCount) {
      // NBandEQ takes planar float PCM through its input render callback.
      guard let format = AVAudioFormat(commonFormat: .pcmFormatFloat32, sampleRate: rate,
                                       channels: AVAudioChannelCount(channels), interleaved: false),
            let input = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: maxFrames),
            let output = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: maxFrames)
      else { return }
      let eq = AVAudioUnitEQ(numberOfBands: AudioEqualizer.bandCount)
      let unit = eq.audioUnit
      AudioUnitUninitialize(unit)
      var stream = format.streamDescription.pointee
      let streamSize = UInt32(MemoryLayout<AudioStreamBasicDescription>.size)
      var frameLimit = maxFrames
      var callback = AURenderCallbackStruct(inputProc: eqInputCallback,
        inputProcRefCon: Unmanaged.passUnretained(self).toOpaque())
      guard AudioUnitSetProperty(unit, kAudioUnitProperty_StreamFormat, kAudioUnitScope_Input,
                                 0, &stream, streamSize) == noErr,
            AudioUnitSetProperty(unit, kAudioUnitProperty_StreamFormat, kAudioUnitScope_Output,
                                 0, &stream, streamSize) == noErr,
            AudioUnitSetProperty(unit, kAudioUnitProperty_MaximumFramesPerSlice, kAudioUnitScope_Global,
                                 0, &frameLimit, UInt32(MemoryLayout.size(ofValue: frameLimit))) == noErr,
            AudioUnitSetProperty(unit, kAudioUnitProperty_SetRenderCallback, kAudioUnitScope_Input,
                                 0, &callback, UInt32(MemoryLayout.size(ofValue: callback))) == noErr,
            AudioUnitInitialize(unit) == noErr
      else { return }
      for (band, frequency) in zip(eq.bands, AudioEqualizer.frequencies) {
        band.filterType = .parametric
        band.frequency = min(frequency, Float(rate * 0.49))
        band.bandwidth = 1
        band.gain = 0
        band.bypass = false
      }
      eqInput = input
      eqOutput = output
      equalizer = eq
    }

    func setGains(_ next: [Float]?) {
      guard next != eqGains else { return }
      eqGains = next
      if let next, let equalizer {
        for (band, gain) in zip(equalizer.bands, next) { band.gain = gain }
      }
    }

    func resetHistory() {
      writtenFrames = 0
      cursor = 0
      if let unit = equalizer?.audioUnit { AudioUnitReset(unit, kAudioUnitScope_Global, 0) }
    }

    private func renderEqualizer(_ first: UnsafeMutablePointer<Float>, _ second: UnsafeMutablePointer<Float>?,
                                 stride: Int, frames: Int) {
      guard let unit = equalizer?.audioUnit, let input = eqInput, let output = eqOutput,
            eqGains?.contains(where: { $0 != 0 }) == true, frames > 0, frames <= Int(input.frameCapacity),
            let source = input.floatChannelData, let result = output.floatChannelData
      else { return }
      input.frameLength = AVAudioFrameCount(frames)
      output.frameLength = AVAudioFrameCount(frames)
      for frame in 0..<frames {
        let index = frame * stride
        source[0][frame] = first[index]
        if channels == 2 { source[1][frame] = second?[frame] ?? first[index + 1] }
      }
      var flags = AudioUnitRenderActionFlags()
      var timestamp = AudioTimeStamp()
      timestamp.mSampleTime = renderedFrames
      timestamp.mFlags = .sampleTimeValid
      renderedFrames += Float64(frames)
      guard AudioUnitRender(unit, &flags, &timestamp, 0, AVAudioFrameCount(frames),
                            output.mutableAudioBufferList) == noErr
      else { return }
      for frame in 0..<frames {
        let index = frame * stride
        first[index] = result[0][frame]
        if channels == 2 {
          if let second { second[frame] = result[1][frame] }
          else { first[index + 1] = result[1][frame] }
        }
      }
    }

    func setProfile(_ next: SpatialProfile?) {
      guard next != profile else { return }
      profile = next
      writtenFrames = 0
      cursor = 0
      if let next {
        for i in next.taps.indices {
          offsets[i] = Int((next.taps[i].milliseconds * rate / 1000).rounded())
        }
      }
    }

    func process(_ buffers: UnsafeMutablePointer<AudioBufferList>, frames: Int, startOfStream: Bool) {
      guard capacity > 0, let owner else { return }
      owner.readEffects(self)
      if startOfStream { resetHistory() }
      let list = UnsafeMutableAudioBufferListPointer(buffers)
      guard let first = list.first?.mData?.assumingMemoryBound(to: Float.self) else { return }
      let second = planar && channels == 2 && list.count == 2
        ? list[1].mData?.assumingMemoryBound(to: Float.self)
        : nil
      if planar && channels == 2 && second == nil { return }
      let stride = planar ? 1 : channels
      renderEqualizer(first, second, stride: stride, frames: frames)
      guard let config = profile, channels == 2 || !config.taps.isEmpty else { return }
      for frame in 0..<frames {
        let index = frame * stride
        let l = first[index]
        let r = channels == 1 ? l : second?[frame] ?? first[index + 1]
        let mid = (l + r) * 0.5
        let side = (l - r) * (config.side * 0.5)
        first[index] = convolve(mid + side, history: &left, config: config)
        if channels == 2 {
          let sample = convolve(mid - side, history: &right, config: config)
          if let second { second[frame] = sample } else { first[index + 1] = sample }
        }
        cursor = (cursor + 1) % capacity
        writtenFrames = min(writtenFrames + 1, capacity)
      }
    }

    private func convolve(_ input: Float, history: inout [Float], config: SpatialProfile) -> Float {
      var result = input * config.dry
      for i in config.taps.indices where offsets[i] <= writtenFrames {
        let past = cursor - offsets[i]
        result += history[past < 0 ? past + capacity : past] * config.taps[i].gain
      }
      history[cursor] = input
      return result
    }
  }
}

// MARK: - MTAudioProcessingTap C callbacks

private func eqTapInit(tap: MTAudioProcessingTap, clientInfo: UnsafeMutableRawPointer?, tapStorageOut: UnsafeMutablePointer<UnsafeMutableRawPointer?>) {
  let eq = Unmanaged<AudioEqualizer>.fromOpaque(clientInfo!).takeUnretainedValue()
  let ctx = AudioEqualizer.TapContext()
  ctx.owner = eq
  eq.registerTap(ctx)
  tapStorageOut.pointee = Unmanaged.passRetained(ctx).toOpaque()
}

private func eqTapFinalize(tap: MTAudioProcessingTap) {
  let storage = MTAudioProcessingTapGetStorage(tap)
  Unmanaged<AudioEqualizer.TapContext>.fromOpaque(storage).takeRetainedValue().unprepare()
}

private let eqInputCallback: AURenderCallback = { refcon, _, _, _, frames, buffers in
  let context = Unmanaged<AudioEqualizer.TapContext>.fromOpaque(refcon).takeUnretainedValue()
  guard let buffers, let input = context.eqInput, frames <= input.frameLength else { return kAudio_ParamError }
  let source = UnsafeMutableAudioBufferListPointer(input.mutableAudioBufferList)
  let target = UnsafeMutableAudioBufferListPointer(buffers)
  guard source.count == target.count else { return kAudio_ParamError }
  let bytes = Int(frames) * MemoryLayout<Float>.stride
  for index in source.indices {
    guard let data = source[index].mData else { return kAudio_ParamError }
    if let output = target[index].mData {
      guard target[index].mDataByteSize >= bytes else { return kAudio_ParamError }
      if output != data { output.copyMemory(from: data, byteCount: bytes) }
    } else {
      target[index].mData = data
    }
    target[index].mDataByteSize = UInt32(bytes)
  }
  return noErr
}

private func eqTapPrepare(tap: MTAudioProcessingTap, maxFrames: CMItemCount, processingFormat: UnsafePointer<AudioStreamBasicDescription>) {
  let storage = MTAudioProcessingTapGetStorage(tap)
  let ctx = Unmanaged<AudioEqualizer.TapContext>.fromOpaque(storage).takeUnretainedValue()
  ctx.prepare(processingFormat.pointee, maxFrames: maxFrames)
}

private func eqTapUnprepare(tap: MTAudioProcessingTap) {
  let ctx = Unmanaged<AudioEqualizer.TapContext>.fromOpaque(MTAudioProcessingTapGetStorage(tap)).takeUnretainedValue()
  ctx.unprepare()
}

private func eqTapProcess(tap: MTAudioProcessingTap, numberFrames: CMItemCount, flags: MTAudioProcessingTapFlags, bufferListInOut: UnsafeMutablePointer<AudioBufferList>, numberFramesOut: UnsafeMutablePointer<CMItemCount>, flagsOut: UnsafeMutablePointer<MTAudioProcessingTapFlags>) {
  var sourceFlags: MTAudioProcessingTapFlags = 0
  let status = MTAudioProcessingTapGetSourceAudio(tap, numberFrames, bufferListInOut, &sourceFlags, nil, numberFramesOut)
  guard status == noErr else { return }

  let storage = MTAudioProcessingTapGetStorage(tap)
  let ctx = Unmanaged<AudioEqualizer.TapContext>.fromOpaque(storage).takeUnretainedValue()
  flagsOut.pointee = sourceFlags
  ctx.process(bufferListInOut, frames: Int(numberFramesOut.pointee),
              startOfStream: (flags | sourceFlags) & kMTAudioProcessingTapFlag_StartOfStream != 0)
}
