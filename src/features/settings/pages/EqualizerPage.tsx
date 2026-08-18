import { useCallback, useEffect, useRef } from '@lynx-js/react'
import { useTranslation } from 'react-i18next'
import type { NodesRef } from '@lynx-js/types'

import { EQ_CENTER_FREQS } from '../../../native/audio-types.js'
import { Icon, ICON_COLORS } from '../../../shared/ui/Icon.js'
import { AppSwitch } from '../../../shared/ui/AppSwitch.js'
import {
  EQ_PRESET_NAMES,
  formatFreq,
  type EqPresetName,
} from '../domain/eq-presets.js'
import {
  gainToSlider,
  pointerYFromEvent,
  ratioFromY,
  sliderToGain,
} from '../domain/eq-slider.js'
import { isWebPlatform } from '../../../native/web-platform.js'
import { useEqStore } from '../store/eq-store.js'
import { SubPageShell } from '../widgets/SubPageShell.js'
import './EqualizerPage.css'

/**
 * Measure an element's viewport-relative `top`/`height` via the async
 * `boundingClientRect` invoke. Lynx refs expose **no synchronous
 * `getBoundingClientRect`** — the only measurement API is this callback-based
 * invoke (the same one lynx-ui's Slider uses), so measurement is inherently
 * async and the caller must be prepared to wait for it.
 */
function invokeBoundingRect(ref: NodesRef): Promise<{ top: number; height: number }> {
  return new Promise((resolve, reject) => {
    ref
      .invoke({
        method: 'boundingClientRect',
        // The track/thumb carry no transforms, but keep this on so the rect
        // matches what is actually rendered if that ever changes.
        params: { androidEnableTransformProps: true },
        success: (res) => resolve(res as { top: number; height: number }),
        fail: (err) => reject(err),
      })
      .exec()
  })
}

function presetLabel(name: EqPresetName, t: (k: string) => string): string {
  return t(`eq.preset_${name}`)
}

/**
 * Custom vertical slider for a single EQ band.
 *
 * Three things broke the earlier implementations and are fixed here:
 *
 * 1. **Measurement.** The first version called `el.getBoundingClientRect()`
 *    synchronously, but Lynx refs have no such method — measurement is only
 *    available through the async `boundingClientRect` invoke. The call produced
 *    nothing and every drag computed `NaN`. We now measure via
 *    `invokeBoundingRect` and buffer the first touch until the rect resolves
 *    (the same pattern lynx-ui's Slider uses).
 *
 * 2. **Gesture ownership.** The bands live inside a vertical `scroll-view`,
 *    which would otherwise claim the vertical swipe and scroll the page instead
 *    of moving the slider. `consume-slide-event` tells the native layer this
 *    surface consumes the swipe, and the `catch*` handlers stop it bubbling.
 *
 * 3. **Pointer type + coordinate space.** On Web a mouse emits `mouse*` events,
 *    not `touch*`, so mouse handlers are bound too (guarded by a "button is
 *    down" flag, since `mousemove` also fires on hover). And the Y coordinate is
 *    read from the field that matches `boundingClientRect`'s space per platform:
 *    `clientY` on Web, `detail.y` on native — using `clientY` on native offset
 *    the thumb by the LynxView's own position (e.g. the status bar).
 *
 * We re-measure on every pointer-down because scrolling changes the track's
 * viewport-relative `top`.
 */
function BandSlider({ hz, gainDb, isWeb, onChange }: {
  hz: number
  gainDb: number
  isWeb: boolean
  onChange: (ratio: number) => void
}) {
  const wrapRef = useRef<NodesRef>(null)
  const topRef = useRef(0)
  const heightRef = useRef(0)
  const measuredRef = useRef(false)
  const measuringRef = useRef(false)
  const pendingYRef = useRef<number | null>(null)
  // Only relevant to mouse input (Web): `mousemove` fires on hover as well, so
  // it must only drive the slider while a button is actually held.
  const mouseDownRef = useRef(false)
  const value = gainToSlider(gainDb)

  const applyY = useCallback((y: number) => {
    const ratio = ratioFromY(y, topRef.current, heightRef.current)
    if (ratio === null) return
    onChange(ratio)
  }, [onChange])

  const flushPending = useCallback(() => {
    if (pendingYRef.current === null || !measuredRef.current) return
    const y = pendingYRef.current
    pendingYRef.current = null
    applyY(y)
  }, [applyY])

  const measure = useCallback(() => {
    if (measuringRef.current) return
    const ref = wrapRef.current
    // In the Vitest env (and any host without the invoke bridge) this is absent;
    // skip measuring rather than throw — the slider just won't drag there.
    if (!ref || typeof ref.invoke !== 'function') return
    measuringRef.current = true
    invokeBoundingRect(ref)
      .then((res) => {
        measuringRef.current = false
        const top = Number(res?.top)
        const height = Number(res?.height)
        if (Number.isFinite(top) && Number.isFinite(height) && height > 0) {
          topRef.current = top
          heightRef.current = height
          measuredRef.current = true
        }
        flushPending()
      })
      .catch(() => {
        measuringRef.current = false
      })
  }, [flushPending])

  const handleStart = useCallback((e: unknown) => {
    const y = pointerYFromEvent(e, isWeb)
    if (!Number.isFinite(y)) return
    // A fresh measure on every pointer-down: the track's viewport-relative `top`
    // changes whenever the surrounding scroll-view scrolls.
    pendingYRef.current = y
    measuredRef.current = false
    measure()
  }, [measure, isWeb])

  const handleMove = useCallback((e: unknown) => {
    const y = pointerYFromEvent(e, isWeb)
    if (!Number.isFinite(y)) return
    if (!measuredRef.current || heightRef.current <= 0) {
      pendingYRef.current = y
      measure()
      return
    }
    applyY(y)
  }, [applyY, measure, isWeb])

  const onMouseDown = useCallback((e: unknown) => {
    mouseDownRef.current = true
    handleStart(e)
  }, [handleStart])

  const onMouseMove = useCallback((e: unknown) => {
    if (!mouseDownRef.current) return
    handleMove(e)
  }, [handleMove])

  const onMouseUp = useCallback(() => {
    mouseDownRef.current = false
  }, [])

  const onTouchEnd = useCallback(() => {
    mouseDownRef.current = false
  }, [])

  return (
    <view className='eq-page__band'>
      <text className='eq-page__band-gain'>
        {gainDb > 0 ? `+${gainDb}` : String(gainDb)}
      </text>
      <view
        ref={wrapRef}
        className='eq-page__band-slider-wrap'
        consume-slide-event={[[-180, 180]]}
        catchtouchstart={handleStart}
        catchtouchmove={handleMove}
        catchtouchend={onTouchEnd}
        catchtouchcancel={onTouchEnd}
        catchmousedown={onMouseDown}
        catchmousemove={onMouseMove}
        catchmouseup={onMouseUp}
        global-bindmouseup={onMouseUp}
        data-testid={`eq-band-${hz}`}
      >
        <view className='eq-page__band-track'>
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
  const { t } = useTranslation()
  const enabled = useEqStore((s) => s.enabled)
  const bands = useEqStore((s) => s.bands)
  const activePreset = useEqStore((s) => s.activePreset)
  // Platform is fixed for the session; read once to pick the pointer
  // coordinate field that matches `boundingClientRect`'s space (see BandSlider).
  const isWeb = isWebPlatform()

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
        which is safe for the drag maths: `invokeBoundingRect` measures the track
        itself and both it and the pointer Y are **viewport**-relative, so no
        ancestor's position enters the calculation — and the track is re-measured
        on every pointer-down anyway (scrolling moves it). Still worth a real
        device pass, since no test can drive a native gesture.
      */}
      <view className='eq-page__bands'>
        {EQ_CENTER_FREQS.map((hz, i) => (
          <BandSlider
            key={hz}
            hz={hz}
            gainDb={bands[i]}
            isWeb={isWeb}
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
