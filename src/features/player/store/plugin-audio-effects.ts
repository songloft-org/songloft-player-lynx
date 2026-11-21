import { readNativeModules } from '../../../native/native-modules.js'
import { desktopPluginAudioEffects } from '../../../desktop/audio.js'
import { EQ_PRESET_NAMES, EQ_PRESETS, type EqPresetName } from '../domain/eq-presets.js'
import {
  REVERB_PRESETS, STEREO_WIDTH_PRESETS, spatialProfile, type ReverbPreset, type StereoWidthPreset,
} from '../domain/plugin-spatial-effects.js'
import { EQ_CENTER_FREQS } from '../../../native/audio-types.js'

interface NativePluginEffects {
  getPluginAudioEffects?: (callback: (mask: number) => void) => void
  setPluginAudioEffects?: (profile: string, callback: (applied: boolean) => void) => void
  getPluginEqualizerAvailable?: (callback: (available: boolean) => void) => void
  setPluginEqualizer?: (profile: string, callback: (applied: boolean) => void) => void
}

interface AudioEffects {
  equalizer?: { preset: EqPresetName }
  reverb?: { preset: ReverbPreset }
  stereoWidth?: { preset: StereoWidthPreset }
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

function playbackAdapter() {
  const audio = desktopPluginAudioEffects() ??
    (readNativeModules()?.SongloftAudio as NativePluginEffects | undefined)
  if (typeof audio?.getPluginAudioEffects === 'function' && typeof audio.setPluginAudioEffects === 'function') {
    return {
      capabilities: () => nativeResult<number>(reply => audio.getPluginAudioEffects!(reply)),
      write: (effects: AudioEffects | null, userEqBands?: readonly number[]) =>
        nativeResult<boolean>(reply => audio.setPluginAudioEffects!(nativeProfile(effects, userEqBands), reply)),
    }
  }
  if (typeof audio?.getPluginEqualizerAvailable === 'function' && typeof audio.setPluginEqualizer === 'function') {
    return {
      capabilities: async () => (await nativeResult<boolean>(reply => audio.getPluginEqualizerAvailable!(reply))) ? 1 : 0,
      write: (effects: AudioEffects | null) => nativeResult<boolean>(reply => audio.setPluginEqualizer!(
        effects?.equalizer ? legacyEqualizer(effects.equalizer.preset) : '', reply,
      )),
    }
  }
}

function nativeResult<T>(invoke: (callback: (result: T) => void) => void) {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('audio effect request timed out')), 3000)
    try {
      invoke((result) => {
        clearTimeout(timeout)
        resolve(result)
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
  if (owner && playbackAdapter())
    session = { id: String(++generation), owner, applied: null, nativeTouched: false }
}

export function endPluginPlayback(owner?: string) {
  const current = session
  if (!current || (owner !== undefined && current.owner !== owner)) return
  session = undefined
  if (current.nativeTouched) {
    const audio = playbackAdapter()
    if (audio) pendingWrite = pendingWrite.then(async () => {
      if (!await audio.write(null)) throw new Error('audio effects could not be cleared')
    }).catch(error => { console.warn('Could not restore the user audio settings', error) })
  }
}

export function hasPluginAudioEffects() {
  return playbackAdapter() !== undefined
}

async function availableEffects(audio: ReturnType<typeof playbackAdapter>) {
  const mask = await audio?.capabilities().catch(() => 0) ?? 0
  return {
    ...(mask & 1 ? { equalizer: { presets: [...EQ_PRESET_NAMES] } } : {}),
    ...(mask & 2 ? { reverb: { presets: [...REVERB_PRESETS] } } : {}),
    ...(mask & 4 ? { stereoWidth: { presets: [...STEREO_WIDTH_PRESETS] } } : {}),
  }
}

export async function getPluginAudioEffects(owner: string | undefined, localOutput: boolean) {
  const supported = await availableEffects(localOutput ? playbackAdapter() : undefined)
  const current = localOutput && owner !== undefined && session?.owner === owner ? session : undefined
  const applied = current?.applied
  const active = applied && Object.fromEntries(
    Object.entries(applied).filter(([key]) => Object.keys(supported).includes(key)),
  )
  return {
    playbackId: current?.id ?? null,
    supported,
    applied: active && Object.keys(active).length ? active : null,
  }
}

type SupportedEffects = Awaited<ReturnType<typeof availableEffects>>

function parseEffects(value: unknown): AudioEffects | null {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('effects must be an object')
  const entries = Object.entries(value)
  if (entries.length === 0) return null
  for (const [key, effect] of entries) {
    const presets: readonly string[] | undefined = key === 'equalizer' ? EQ_PRESET_NAMES
      : key === 'reverb' ? REVERB_PRESETS
      : key === 'stereoWidth' ? STEREO_WIDTH_PRESETS : undefined
    if (!presets) throw new Error('unsupported audio effect')
    if (!effect || typeof effect !== 'object' || !Object.keys(effect).includes('preset') ||
        Object.keys(effect).length !== 1 || !presets.includes(effect.preset))
      throw new Error(`unsupported ${key} preset`)
  }
  return Object.fromEntries(entries) as AudioEffects
}

function checkSupported(effects: AudioEffects, supported: SupportedEffects) {
  if (Object.keys(effects).some(key => !Object.keys(supported).includes(key)))
    throw new Error('unsupported audio effect')
}

export async function setPluginAudioEffects(
  owner: string | undefined,
  playbackId: unknown,
  effects: unknown,
  canWrite: () => boolean,
  userEqBands?: readonly number[],
) {
  const audio = playbackAdapter()
  if (!audio) throw new Error('audio effects unavailable')
  const current = session
  if (!owner || !current || current.owner !== owner || current.id !== playbackId || !canWrite())
    throw new Error('playback session is no longer available')
  const applied = parseEffects(effects)
  const write = pendingWrite.then(async () => {
    if (applied) checkSupported(applied, await availableEffects(audio))
    if (current !== session || !canWrite()) throw new Error('playback session is no longer available')
    if (applied === null && !current.nativeTouched) return null
    current.nativeTouched = true
    let success: boolean
    try {
      success = await audio.write(applied, userEqBands)
    } catch (error) {
      // A lost reply can leave a native profile installed. Restore the last
      // acknowledged state while this playback still owns the output.
      if (current === session) {
        const restored = await audio.write(current.applied, userEqBands).catch(() => false)
        if (restored === true && current.applied === null) current.nativeTouched = false
      }
      throw error
    }
    if (current !== session) throw new Error('playback session is no longer available')
    if (success !== true) throw new Error('audio effect could not be applied')
    current.applied = applied
    current.nativeTouched = applied !== null
    return applied
  })
  pendingWrite = write.then(() => {}, () => {})
  return write
}

function legacyEqualizer(preset: EqPresetName) {
  return JSON.stringify({ frequencies: EQ_CENTER_FREQS, gains: EQ_PRESETS[preset] })
}

function nativeProfile(effects: AudioEffects | null, userEqBands?: readonly number[]) {
  if (effects === null) return ''
  const eq = effects.equalizer?.preset
  const reverb = effects.reverb?.preset
  const width = effects.stereoWidth?.preset
  const gains = eq ? EQ_PRESETS[eq] : null
  return JSON.stringify({
    gains,
    frequencies: EQ_CENTER_FREQS,
    spatial: reverb || width ? spatialProfile(reverb, width, gains ?? userEqBands) : null,
  })
}
