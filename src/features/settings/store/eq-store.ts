import { create } from 'zustand'

import { getAudio } from '../../../native/audio-facade.js'
import { getSongloftStorage } from '../../../core/storage/index.js'
import {
  clampGain,
  EQ_BAND_COUNT,
  EQ_PRESETS,
  type EqPresetName,
} from '../domain/eq-presets.js'

const PREF_EQ_ENABLED = 'eq_enabled'
const PREF_EQ_BANDS = 'eq_bands'
const PREF_EQ_PRESET = 'eq_preset'

export type ActivePreset = EqPresetName | 'custom'

export interface EqState {
  enabled: boolean
  bands: number[]
  activePreset: ActivePreset
  toggle: () => void
  selectPreset: (name: EqPresetName) => void
  adjustBand: (index: number, gainDb: number) => void
  reset: () => void
  hydrate: () => Promise<void>
}

function flatBands(): number[] {
  return Array.from({ length: EQ_BAND_COUNT }, () => 0)
}

function syncAllBandsToAudio(bands: number[], enabled: boolean) {
  const audio = getAudio()
  void audio.setEqualizerEnabled(enabled)
  if (enabled) {
    for (let i = 0; i < bands.length; i++) {
      void audio.setEqualizerBand(i, bands[i])
    }
  }
}

function persist(enabled: boolean, bands: number[], preset: ActivePreset) {
  const storage = getSongloftStorage()
  void storage.prefs.set(PREF_EQ_ENABLED, String(enabled)).catch(() => {})
  void storage.prefs.set(PREF_EQ_BANDS, JSON.stringify(bands)).catch(() => {})
  void storage.prefs.set(PREF_EQ_PRESET, preset).catch(() => {})
}

export const useEqStore = create<EqState>((set, get) => ({
  enabled: false,
  bands: flatBands(),
  activePreset: 'flat' as ActivePreset,

  toggle() {
    const next = !get().enabled
    set({ enabled: next })
    void getAudio().setEqualizerEnabled(next)
    persist(next, get().bands, get().activePreset)
  },

  selectPreset(name: EqPresetName) {
    const bands = [...EQ_PRESETS[name]]
    set({ bands, activePreset: name })
    syncAllBandsToAudio(bands, get().enabled)
    persist(get().enabled, bands, name)
  },

  adjustBand(index: number, gainDb: number) {
    const bands = [...get().bands]
    bands[index] = clampGain(gainDb)
    set({ bands, activePreset: 'custom' })
    if (get().enabled) {
      void getAudio().setEqualizerBand(index, bands[index])
    }
    persist(get().enabled, bands, 'custom')
  },

  reset() {
    const bands = flatBands()
    set({ bands, activePreset: 'flat', enabled: false })
    syncAllBandsToAudio(bands, false)
    persist(false, bands, 'flat')
  },

  async hydrate() {
    const storage = getSongloftStorage()
    try {
      const [enabledStr, bandsStr, presetStr] = await Promise.all([
        storage.prefs.get(PREF_EQ_ENABLED).catch(() => null),
        storage.prefs.get(PREF_EQ_BANDS).catch(() => null),
        storage.prefs.get(PREF_EQ_PRESET).catch(() => null),
      ])

      const enabled = enabledStr === 'true'
      let bands = flatBands()
      if (bandsStr) {
        try {
          const parsed = JSON.parse(bandsStr)
          if (Array.isArray(parsed) && parsed.length === EQ_BAND_COUNT) {
            bands = parsed.map((v: unknown) => clampGain(Number(v) || 0))
          }
        } catch { /* keep flat */ }
      }

      const preset: ActivePreset =
        presetStr && (presetStr === 'custom' || presetStr in EQ_PRESETS)
          ? (presetStr as ActivePreset)
          : 'flat'

      set({ enabled, bands, activePreset: preset })
      syncAllBandsToAudio(bands, enabled)
    } catch {
      // best-effort — leave defaults
    }
  },
}))
