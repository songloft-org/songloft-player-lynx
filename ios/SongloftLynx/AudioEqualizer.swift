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

  private(set) var audioUnit: AudioUnit?
  private var enabled = false
  private var pendingGains: [Int: Float] = [:]
  private var pluginGains: [Float]?

  init() {
    createAudioUnit()
  }

  deinit {
    if let au = audioUnit {
      AudioUnitUninitialize(au)
      AudioComponentInstanceDispose(au)
    }
  }

  // MARK: - Public API

  func setEnabled(_ on: Bool) {
    enabled = on
    guard pluginGains == nil, let au = audioUnit else { return }
    if on {
      for (band, gain) in pendingGains {
        applyGain(au, band: band, gain: gain)
      }
    } else {
      for i in 0..<Self.bandCount {
        applyGain(au, band: i, gain: 0)
      }
    }
  }

  func setBand(_ index: Int, gain: Float) {
    let clamped = min(max(gain, -12), 12)
    pendingGains[index] = clamped
    guard enabled, pluginGains == nil, let au = audioUnit else { return }
    applyGain(au, band: index, gain: clamped)
  }

  func setPluginProfile(_ raw: String) -> Bool {
    let gains: [Float]?
    if raw.isEmpty {
      gains = nil
    } else {
      guard let data = raw.data(using: .utf8),
        let profile = try? JSONDecoder().decode(PluginProfile.self, from: data),
        profile.gains.count == Self.bandCount,
        profile.gains.allSatisfy({ $0.isFinite && (-12...12).contains($0) })
      else { return false }
      gains = profile.gains
    }
    guard let au = audioUnit else { return gains == nil }
    for i in 0..<Self.bandCount {
      let gain = gains?[i] ?? (enabled ? pendingGains[i] ?? 0 : 0)
      guard applyGain(au, band: i, gain: gain) else {
        for index in 0..<Self.bandCount {
          let previous = pluginGains?[index] ?? (enabled ? pendingGains[index] ?? 0 : 0)
          applyGain(au, band: index, gain: previous)
        }
        return false
      }
    }
    pluginGains = gains
    return true
  }

  private struct PluginProfile: Decodable {
    let gains: [Float]
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

  // MARK: - AudioUnit setup

  private func createAudioUnit() {
    var desc = AudioComponentDescription(
      componentType: kAudioUnitType_Effect,
      componentSubType: kAudioUnitSubType_NBandEQ,
      componentManufacturer: kAudioUnitManufacturer_Apple,
      componentFlags: 0,
      componentFlagsMask: 0
    )
    guard let component = AudioComponentFindNext(nil, &desc) else { return }
    var au: AudioUnit?
    guard AudioComponentInstanceNew(component, &au) == noErr, let au else { return }

    var numBands: UInt32 = UInt32(Self.bandCount)
    AudioUnitSetProperty(au, kAUNBandEQProperty_NumberOfBands,
                         kAudioUnitScope_Global, 0, &numBands, UInt32(MemoryLayout<UInt32>.size))
    AudioUnitInitialize(au)

    for i in 0..<Self.bandCount {
      let offset = UInt32(i * 20)
      AudioUnitSetParameter(au, AudioUnitParameterID(kAUNBandEQParam_FilterType + offset),
                            kAudioUnitScope_Global, 0, 0, 0)
      AudioUnitSetParameter(au, AudioUnitParameterID(kAUNBandEQParam_Frequency + offset),
                            kAudioUnitScope_Global, 0, Self.frequencies[i], 0)
      AudioUnitSetParameter(au, AudioUnitParameterID(kAUNBandEQParam_Bandwidth + offset),
                            kAudioUnitScope_Global, 0, 1.0, 0)
      AudioUnitSetParameter(au, AudioUnitParameterID(kAUNBandEQParam_Gain + offset),
                            kAudioUnitScope_Global, 0, 0, 0)
      AudioUnitSetParameter(au, AudioUnitParameterID(kAUNBandEQParam_BypassBand + offset),
                            kAudioUnitScope_Global, 0, 0, 0)
    }

    audioUnit = au
  }

  @discardableResult
  private func applyGain(_ au: AudioUnit, band: Int, gain: Float) -> Bool {
    guard band >= 0 && band < Self.bandCount else { return false }
    return AudioUnitSetParameter(au, AudioUnitParameterID(kAUNBandEQParam_Gain + UInt32(band * 20)),
                                 kAudioUnitScope_Global, 0, gain, 0) == noErr
  }

  /// Context passed through the tap's storage pointer.
  class TapContext {
    var audioUnit: AudioUnit?
  }
}

// MARK: - MTAudioProcessingTap C callbacks

private func eqTapInit(tap: MTAudioProcessingTap, clientInfo: UnsafeMutableRawPointer?, tapStorageOut: UnsafeMutablePointer<UnsafeMutableRawPointer?>) {
  let eq = Unmanaged<AudioEqualizer>.fromOpaque(clientInfo!).takeUnretainedValue()
  let ctx = AudioEqualizer.TapContext()
  ctx.audioUnit = eq.audioUnit
  tapStorageOut.pointee = Unmanaged.passRetained(ctx).toOpaque()
}

private func eqTapFinalize(tap: MTAudioProcessingTap) {
  let storage = MTAudioProcessingTapGetStorage(tap)
  Unmanaged<AudioEqualizer.TapContext>.fromOpaque(storage).release()
}

private func eqTapPrepare(tap: MTAudioProcessingTap, maxFrames: CMItemCount, processingFormat: UnsafePointer<AudioStreamBasicDescription>) {
  let storage = MTAudioProcessingTapGetStorage(tap)
  let ctx = Unmanaged<AudioEqualizer.TapContext>.fromOpaque(storage).takeUnretainedValue()
  guard let au = ctx.audioUnit else { return }

  var format = processingFormat.pointee
  let size = UInt32(MemoryLayout<AudioStreamBasicDescription>.size)
  AudioUnitSetProperty(au, kAudioUnitProperty_StreamFormat, kAudioUnitScope_Input, 0, &format, size)
  AudioUnitSetProperty(au, kAudioUnitProperty_StreamFormat, kAudioUnitScope_Output, 0, &format, size)
  var frames = UInt32(maxFrames)
  AudioUnitSetProperty(au, kAudioUnitProperty_MaximumFramesPerSlice, kAudioUnitScope_Global, 0,
                       &frames, UInt32(MemoryLayout<UInt32>.size))
  AudioUnitInitialize(au)
}

private func eqTapUnprepare(tap: MTAudioProcessingTap) {
}

private func eqTapProcess(tap: MTAudioProcessingTap, numberFrames: CMItemCount, flags: MTAudioProcessingTapFlags, bufferListInOut: UnsafeMutablePointer<AudioBufferList>, numberFramesOut: UnsafeMutablePointer<CMItemCount>, flagsOut: UnsafeMutablePointer<MTAudioProcessingTapFlags>) {
  var sourceFlags: MTAudioProcessingTapFlags = 0
  let status = MTAudioProcessingTapGetSourceAudio(tap, numberFrames, bufferListInOut, &sourceFlags, nil, numberFramesOut)
  guard status == noErr else { return }

  let storage = MTAudioProcessingTapGetStorage(tap)
  let ctx = Unmanaged<AudioEqualizer.TapContext>.fromOpaque(storage).takeUnretainedValue()
  guard let au = ctx.audioUnit else { return }

  var renderFlags = AudioUnitRenderActionFlags()
  var timeStamp = AudioTimeStamp()
  timeStamp.mFlags = .sampleTimeValid
  AudioUnitRender(au, &renderFlags, &timeStamp, 0, UInt32(numberFrames), bufferListInOut)
}
