import { EQ_CENTER_FREQS } from '../../../native/audio-types.js'

export const EQ_GAIN_MIN = -12
export const EQ_GAIN_MAX = 12
export const EQ_BAND_COUNT = EQ_CENTER_FREQS.length

export type EqPresetName = 'flat' | 'rock' | 'pop' | 'jazz' | 'classical' | 'bassBoost' | 'vocal'

export const EQ_PRESET_NAMES: readonly EqPresetName[] = [
  'flat', 'rock', 'pop', 'jazz', 'classical', 'bassBoost', 'vocal',
]

export const EQ_PRESETS: Record<EqPresetName, readonly number[]> = {
  flat:       [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  rock:       [5, 4, 3, 1, -1, -1, 0, 2, 3, 4],
  pop:        [-1, 1, 3, 4, 3, 0, -1, -1, 1, 2],
  jazz:       [3, 2, 1, 2, -1, -1, 0, 1, 2, 3],
  classical:  [4, 3, 2, 1, -1, -1, 0, 2, 3, 4],
  bassBoost:  [6, 5, 4, 2, 0, 0, 0, 0, 0, 0],
  vocal:      [-2, -1, 0, 2, 4, 4, 3, 1, 0, -1],
}

export function clampGain(db: number): number {
  return Math.max(EQ_GAIN_MIN, Math.min(EQ_GAIN_MAX, db))
}

export function formatFreq(hz: number): string {
  return hz >= 1000 ? `${hz / 1000}k` : String(hz)
}
