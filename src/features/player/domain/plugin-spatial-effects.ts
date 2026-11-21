import { EQ_CENTER_FREQS } from '../../../native/audio-types.js'

export const REVERB_PRESETS = ['room', 'hall'] as const
export const STEREO_WIDTH_PRESETS = ['subtle', 'wide'] as const

export type ReverbPreset = typeof REVERB_PRESETS[number]
export type StereoWidthPreset = typeof STEREO_WIDTH_PRESETS[number]

// The same sparse impulse response is sent to every host. Varying the
// spacing and signs gives a decaying diffuse tail without feeding audio
// back into the player or extending the media timeline.
function impulse(preset: ReverbPreset) {
  const room = preset === 'room'
  const taps = Array.from({ length: 48 }, (_, i) => {
    const milliseconds = (room ? 11 : 23) + i * (room ? 7 : 17) + (i * i * 13 % 17) / 4
    const gain = (i % 4 < 2 ? 1 : -1) * Math.exp(-i / (room ? 10 : 15))
    return { milliseconds, gain }
  })
  const total = taps.reduce((sum, tap) => sum + Math.abs(tap.gain), 0)
  return taps.map(({ milliseconds, gain }) => ({
    milliseconds, gain: gain * (room ? 0.38 : 0.58) / total,
  }))
}

const reverb = { room: impulse('room'), hall: impulse('hall') }
const sideGain = { subtle: 1.2, wide: 1.5 }

// Estimate the overlapping boosts from the ten EQ bands. Broad peaks cover
// the one-octave filters and their neighbours. At the ends, allow the full
// shelf boost used by Web. Negative bands do not offset this headroom.
function equalizerHeadroom(bands: readonly number[]) {
  const boosts = bands.flatMap((gain, index) => {
    if (gain <= 0) return []
    const amplitude = 10 ** (gain / 20)
    return [{ gain, index, center: EQ_CENTER_FREQS[index], amplitude }]
  })
  if (boosts.length === 0) return 1

  let peakDb = 0
  for (let step = 0; step <= 132; step++) {
    const frequency = 10 * 2 ** (step / 12)
    let boostDb = 0
    for (const { gain, index, center, amplitude } of boosts) {
      const distance = frequency / center - center / frequency
      const ratio = distance * distance * 0.5
      const peak = 10 * Math.log10((ratio + amplitude) / (ratio + 1 / amplitude))
      const shelf = (index === 0 && frequency <= center * 2) ||
        (index === EQ_CENTER_FREQS.length - 1 && frequency >= center / 2)
      boostDb += shelf ? gain : peak
    }
    peakDb = Math.max(peakDb, boostDb)
  }
  // Leave additional room for transient peaks and platform EQ bandwidths.
  return 10 ** (-(peakDb + 2) / 20)
}

export function spatialProfile(
  reverbPreset?: ReverbPreset, widthPreset?: StereoWidthPreset, equalizerBands: readonly number[] = [],
) {
  const side = widthPreset ? sideGain[widthPreset] : 1
  const taps = reverbPreset ? reverb[reverbPreset] : []
  const dry = taps.length === 0 ? 1 : 0.9
  // Reserve peak headroom for the sum of the dry signal and all reflections.
  const peak = dry + taps.reduce((sum, tap) => sum + Math.abs(tap.gain), 0)
  const gain = equalizerHeadroom(equalizerBands) / (peak * side)
  return { side, dry: dry * gain, taps: taps.map(tap => ({ ...tap, gain: tap.gain * gain })) }
}
