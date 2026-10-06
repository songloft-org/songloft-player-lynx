import { useEffect } from '@lynx-js/react'
import { useTranslation } from 'react-i18next'

import { EQ_CENTER_FREQS } from '../../../native/audio-types.js'
import { getPlatformCapabilities } from '../../../native/platform-capabilities.js'
import { Icon, ICON_COLORS } from '../../../shared/ui/Icon.js'
import { AppSwitch } from '../../../shared/ui/AppSwitch.js'
import { VerticalSlider } from '../../../shared/ui/VerticalSlider.js'
import { performRouteBack } from '../../../core/navigation/route-back-action.js'
import {
  EQ_PRESET_NAMES,
  formatFreq,
  type EqPresetName,
} from '../domain/eq-presets.js'
import { gainToSlider, sliderToGain } from '../domain/eq-slider.js'
import { useEqStore } from '../store/eq-store.js'
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

/**
 * `/player/eq` — 10-band equalizer, reached only from the player's `⋯` menu.
 *
 * Chrome-less full-screen page hung off the root route (like `/player/dlna` and
 * `/player/lyrics/*`), not a settings sub-page: the equalizer is a playback
 * control, not a preference, so its only entry point is the player. The
 * settings page used to carry a duplicate row and hosted this page as
 * `/settings/eq`; both were removed.
 *
 * Back returns to `/player` via `route-back.ts` (`/player/eq` → `/player`),
 * which the top-bar arrow and the hardware key both resolve through.
 */
export function EqualizerPage() {
  const { t } = useTranslation()
  const enabled = useEqStore((s) => s.enabled)
  const bands = useEqStore((s) => s.bands)
  const activePreset = useEqStore((s) => s.activePreset)
  const supported = getPlatformCapabilities().equalizer

  useEffect(() => {
    if (supported) void useEqStore.getState().hydrate()
  }, [supported])

  return (
    <view className='eq-page'>
      <view className='eq-page__topbar'>
        <view
          className='eq-page__back'
          bindtap={() => performRouteBack()}
          accessibility-element={true}
          accessibility-label={t('common.back')}
          data-testid='eq-back'
        >
          <Icon name='chevron-down' size={22} color={ICON_COLORS.content} />
        </view>
        <text className='eq-page__title'>{t('eq.title')}</text>
      </view>

      {supported ? <scroll-view className='eq-page__content' scroll-y>
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
          10-band vertical sliders. `VerticalSlider` measures the surface itself
          and both it and the pointer Y are **viewport**-relative, so an ancestor
          `scroll-view` does not enter the calculation — the surface is
          re-measured on every pointer-down anyway (scrolling moves it). Still
          worth a real device pass, since no test can drive a native gesture.
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
      </scroll-view> : <view className='eq-page__content'>
        <text>{t('eq.unsupported')}</text>
      </view>}
    </view>
  )
}
