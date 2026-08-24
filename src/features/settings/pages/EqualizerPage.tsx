import { useEffect } from '@lynx-js/react'
import { useTranslation } from 'react-i18next'

import { EQ_CENTER_FREQS } from '../../../native/audio-types.js'
import { Icon, ICON_COLORS } from '../../../shared/ui/Icon.js'
import { AppSwitch } from '../../../shared/ui/AppSwitch.js'
import { VerticalSlider } from '../../../shared/ui/VerticalSlider.js'
import {
  EQ_PRESET_NAMES,
  formatFreq,
  type EqPresetName,
} from '../domain/eq-presets.js'
import { gainToSlider, sliderToGain } from '../domain/eq-slider.js'
import { useEqStore } from '../store/eq-store.js'
import { SubPageShell } from '../widgets/SubPageShell.js'
import './EqualizerPage.css'

function presetLabel(name: EqPresetName, t: (k: string) => string): string {
  return t(`eq.preset_${name}`)
}

/**
 * One EQ band: gain readout, vertical slider, frequency label.
 *
 * The drag surface is the shared {@link VerticalSlider} — the async measurement,
 * gesture ownership and per-platform pointer coordinate all live there (and are
 * documented there, since each of them broke an earlier version of this page).
 * What stays here is the only band-specific part: dB ↔ ratio.
 */
function BandSlider({ hz, gainDb, onChange }: {
  hz: number
  gainDb: number
  onChange: (ratio: number) => void
}) {
  return (
    <view className='eq-page__band'>
      <text className='eq-page__band-gain'>
        {gainDb > 0 ? `+${gainDb}` : String(gainDb)}
      </text>
      <VerticalSlider
        value={gainToSlider(gainDb)}
        onChange={onChange}
        className='eq-page__band-slider-wrap'
        trackClassName='eq-page__band-track'
        indicatorClassName='eq-page__band-indicator'
        thumbClassName='eq-page__band-thumb'
        testId={`eq-band-${hz}`}
      />
      <text className='eq-page__band-freq'>{formatFreq(hz)}</text>
    </view>
  )
}

export function EqualizerPage() {
  const { t } = useTranslation()
  const enabled = useEqStore((s) => s.enabled)
  const bands = useEqStore((s) => s.bands)
  const activePreset = useEqStore((s) => s.activePreset)

  useEffect(() => {
    void useEqStore.getState().hydrate()
  }, [])

  return (
    <SubPageShell
      title={t('eq.title')}
      // `backTo`, not `onBack`: an explicit onBack tells the shell "this back is
      // meaningful even inside the settings pane", which is only true for an
      // in-pane sibling swap. Routing to /settings is a dead key there.
      backTestId='eq-back'
      contentClassName='eq-page__content'
    >
      {/* Enable toggle */}
      <view className='eq-page__toggle-row'>
        <text className='eq-page__toggle-label'>{t('eq.enabled')}</text>
        <AppSwitch
          checked={enabled}
          onChange={() => useEqStore.getState().toggle()}
        />
      </view>

      {/* Preset chips */}
      <view className='eq-page__presets'>
        {EQ_PRESET_NAMES.map((name) => (
          <view
            key={name}
            className={
              activePreset === name
                ? 'eq-page__chip eq-page__chip--active'
                : 'eq-page__chip'
            }
            bindtap={() => useEqStore.getState().selectPreset(name)}
            data-testid={`eq-preset-${name}`}
          >
            <text className='eq-page__chip-text'>
              {presetLabel(name, t)}
            </text>
          </view>
        ))}
      </view>

      {/*
        10-band vertical sliders. The shell adds one wrapper around this content,
        which is safe for the drag maths: `VerticalSlider` measures the surface
        itself and both it and the pointer Y are **viewport**-relative, so no
        ancestor's position enters the calculation — and the surface is re-measured
        on every pointer-down anyway (scrolling moves it). Still worth a real
        device pass, since no test can drive a native gesture.
      */}
      <view className='eq-page__bands'>
        {EQ_CENTER_FREQS.map((hz, i) => (
          <BandSlider
            key={hz}
            hz={hz}
            gainDb={bands[i]}
            onChange={(v) => useEqStore.getState().adjustBand(i, Math.round(sliderToGain(v)))}
          />
        ))}
      </view>

      {/* Reset button */}
      <view
        className='eq-page__reset'
        bindtap={() => useEqStore.getState().reset()}
        data-testid='eq-reset'
      >
        <text className='eq-page__reset-text'>{t('eq.reset')}</text>
      </view>
    </SubPageShell>
  )
}
