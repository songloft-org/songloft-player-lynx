import { useCallback, useEffect, useRef } from '@lynx-js/react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { EQ_CENTER_FREQS } from '../../../native/audio-types.js'
import { Icon, ICON_COLORS } from '../../../shared/ui/Icon.js'
import { AppSwitch } from '../../../shared/ui/AppSwitch.js'
import {
  EQ_GAIN_MAX,
  EQ_GAIN_MIN,
  EQ_PRESET_NAMES,
  formatFreq,
  type EqPresetName,
} from '../domain/eq-presets.js'
import { useEqStore } from '../store/eq-store.js'
import './EqualizerPage.css'

const GAIN_RANGE = EQ_GAIN_MAX - EQ_GAIN_MIN

function gainToSlider(db: number): number {
  return (db - EQ_GAIN_MIN) / GAIN_RANGE
}

function sliderToGain(v: number): number {
  return v * GAIN_RANGE + EQ_GAIN_MIN
}

function presetLabel(name: EqPresetName, t: (k: string) => string): string {
  return t(`eq.preset_${name}`)
}

/**
 * Custom vertical slider for EQ bands. Lynx Slider is horizontal-only and
 * CSS transform rotation doesn't work for touch interaction, so we use
 * bindtouchstart/bindtouchmove to track vertical finger position.
 */
function BandSlider({ hz, gainDb, onChange }: {
  hz: number
  gainDb: number
  onChange: (ratio: number) => void
}) {
  const wrapperRef = useRef<{ getBoundingClientRect: () => { top: number; height: number } } | null>(null)
  const value = gainToSlider(gainDb)

  const resolveRatio = useCallback((clientY: number) => {
    const el = wrapperRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const ratio = 1 - Math.max(0, Math.min(1, (clientY - rect.top) / rect.height))
    onChange(ratio)
  }, [onChange])

  const handleTouch = useCallback((e: { touches: Array<{ clientY: number }> }) => {
    if (e.touches?.[0]) resolveRatio(e.touches[0].clientY)
  }, [resolveRatio])

  return (
    <view className='eq-page__band'>
      <text className='eq-page__band-gain'>
        {gainDb > 0 ? `+${gainDb}` : String(gainDb)}
      </text>
      <view
        className='eq-page__band-slider-wrap'
        bindtouchstart={handleTouch}
        bindtouchmove={handleTouch}
      >
        <view
          // @ts-expect-error Lynx ref type
          ref={wrapperRef}
          className='eq-page__band-track'
        >
          <view
            className='eq-page__band-indicator'
            style={{ height: `${value * 100}%` }}
          />
          <view
            className='eq-page__band-thumb'
            style={{ bottom: `${value * 100}%` }}
          />
        </view>
      </view>
      <text className='eq-page__band-freq'>{formatFreq(hz)}</text>
    </view>
  )
}

export function EqualizerPage() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const enabled = useEqStore((s) => s.enabled)
  const bands = useEqStore((s) => s.bands)
  const activePreset = useEqStore((s) => s.activePreset)

  useEffect(() => {
    void useEqStore.getState().hydrate()
  }, [])

  const goBack = () => {
    void navigate({ to: '/settings' })
  }

  return (
    <view className='eq-page'>
      <view className='eq-page__topbar'>
        <view className='eq-page__back' bindtap={goBack} data-testid='eq-back'>
          <Icon name='chevron-down' size={22} color={ICON_COLORS.content} />
        </view>
        <text className='eq-page__title'>{t('eq.title')}</text>
      </view>

      <scroll-view className='eq-page__scroll' scroll-y>
        <view className='eq-page__content'>
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

          {/* 10-band vertical sliders */}
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
        </view>
      </scroll-view>
    </view>
  )
}
