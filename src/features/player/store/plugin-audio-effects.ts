import { readNativeModules } from '../../../native/native-modules.js'
import { desktopPluginEqualizer } from '../../../desktop/audio.js'
import { EQ_PRESET_NAMES, EQ_PRESETS, type EqPresetName } from '../domain/eq-presets.js'
import { EQ_CENTER_FREQS } from '../../../native/audio-types.js'

interface NativePluginEqualizer {
  getPluginEqualizerAvailable?: (callback: (available: boolean) => void) => void
  setPluginEqualizer?: (profile: string, callback: (applied: boolean) => void) => void
}

interface AudioEffects {
  equalizer?: { preset: EqPresetName }
}

interface PlaybackSession {
  id: string
  owner: string
  applied: AudioEffects | null
  nativeTouched: boolean
}

let session: PlaybackSession | undefined
let generation = 0
let pendingWrite: Promise<void> = Promise.resolve()

function nativeEqualizer() {
  const desktop = desktopPluginEqualizer()
  if (desktop) return desktop
  const audio = readNativeModules()?.SongloftAudio as NativePluginEqualizer | undefined
  return typeof audio?.getPluginEqualizerAvailable === 'function' &&
    typeof audio.setPluginEqualizer === 'function' ? audio : undefined
}

function nativeResult(invoke: (callback: (result: boolean) => void) => void) {
  return new Promise<boolean>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('audio effect request timed out')), 3000)
    try {
      invoke((result) => {
        clearTimeout(timeout)
        resolve(result === true)
      })
    } catch (error) {
      clearTimeout(timeout)
      reject(error)
    }
  })
}

export function startPluginPlayback(owner?: string, preserveForOwner = false) {
  if (preserveForOwner && owner && session?.owner === owner) return
  endPluginPlayback()
  if (owner && nativeEqualizer())
    session = { id: String(++generation), owner, applied: null, nativeTouched: false }
}

export function endPluginPlayback(owner?: string) {
  const current = session
  if (!current || (owner !== undefined && current.owner !== owner)) return
  session = undefined
  if (current.nativeTouched) {
    const audio = nativeEqualizer()
    if (audio?.setPluginEqualizer) {
      try { audio.setPluginEqualizer('', () => {}) }
      catch (error) { console.warn('Could not restore the user equalizer', error) }
    }
  }
}

export function hasPluginAudioEffects() {
  return nativeEqualizer() !== undefined
}

export async function getPluginAudioEffects(owner: string | undefined, localOutput: boolean) {
  const audio = localOutput ? nativeEqualizer() : undefined
  const available = await (audio?.getPluginEqualizerAvailable
    ? nativeResult((reply) => audio.getPluginEqualizerAvailable!(reply)).catch(() => false)
    : false)
  const current = localOutput && owner !== undefined && session?.owner === owner ? session : undefined
  return {
    playbackId: current?.id ?? null,
    supported: available ? { equalizer: { presets: [...EQ_PRESET_NAMES] } } : {},
    applied: available ? current?.applied ?? null : null,
  }
}

function parseEffects(value: unknown): AudioEffects | null {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('effects must be an object')
  const effects = value as Record<string, unknown>
  const keys = Object.keys(effects)
  if (keys.length === 0) return null
  if (keys.length !== 1 || keys[0] !== 'equalizer')
    throw new Error('unsupported audio effect')
  const equalizer = effects.equalizer
  if (!equalizer || typeof equalizer !== 'object' || Array.isArray(equalizer) ||
      Object.keys(equalizer).length !== 1)
    throw new Error('equalizer must specify a supported preset')
  const { preset } = equalizer as { preset?: unknown }
  if (typeof preset !== 'string' || !EQ_PRESET_NAMES.includes(preset as EqPresetName))
    throw new Error('unsupported equalizer preset')
  return { equalizer: { preset: preset as EqPresetName } }
}

export async function setPluginAudioEffects(
  owner: string | undefined,
  playbackId: unknown,
  effects: unknown,
  canWrite: () => boolean,
) {
  const audio = nativeEqualizer()
  if (!audio?.setPluginEqualizer) throw new Error('audio effects unavailable')
  const current = session
  if (!owner || !current || current.owner !== owner || current.id !== playbackId || !canWrite())
    throw new Error('playback session is no longer available')
  const applied = parseEffects(effects)
  const write = pendingWrite.then(async () => {
    if (current !== session || !canWrite()) throw new Error('playback session is no longer available')
    if (applied === null && current.applied === null) return null
    current.nativeTouched = true
    let success: boolean
    try {
      success = await nativeResult((reply) => audio.setPluginEqualizer!(nativeProfile(applied), reply))
    } catch (error) {
      // A lost reply can leave a native profile installed. Restore the last
      // acknowledged state while this playback still owns the output.
      if (current === session)
        await nativeResult((reply) => audio.setPluginEqualizer!(nativeProfile(current.applied), reply))
          .catch(() => false)
      throw error
    }
    if (current !== session) throw new Error('playback session is no longer available')
    if (!success) throw new Error('audio effect could not be applied')
    current.applied = applied
    return applied
  })
  pendingWrite = write.then(() => {}, () => {})
  return write
}

function nativeProfile(effects: AudioEffects | null) {
  const preset = effects?.equalizer?.preset
  return preset === undefined ? '' : JSON.stringify({
    frequencies: EQ_CENTER_FREQS,
    gains: EQ_PRESETS[preset],
  })
}
