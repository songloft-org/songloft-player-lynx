import { runOnMainThread, useEffect, useMainThreadRef, useMemo, useState, useSyncExternalStore, type ReactNode } from '@lynx-js/react'
import type { MainThread } from '@lynx-js/types'

import { getPlatformTarget } from '../../native/platform-target.js'
import { readLynxGlobal } from '../../native/native-modules.js'
import { getReduceMotion, subscribeReduceMotion } from '../theme/reduce-motion-model.js'
import { useSurfaceAppearance } from '../theme/surface-appearance.js'
import { sampleTabEngagement, sampleTabSpring, TAB_SETTLE_MS, tabSpringFrames, type TabSpring } from './liquid-tab-motion.js'

interface MotionState {
  spring: TabSpring
  travel?: MainThread.Animation
  jelly?: MainThread.Animation
  light?: MainThread.Animation
}

/** One material plane below crisp, stationary navigation controls. */
export function LiquidTabIndicator({ index, count, backdrop, children }: { index: number, count: number, backdrop?: ReactNode, children?: ReactNode }) {
  const travelRef = useMainThreadRef<MainThread.Element>(null)
  const jellyRef = useMainThreadRef<MainThread.Element>(null)
  const opticalRef = useMainThreadRef<MainThread.Element>(null)
  const lightRef = useMainThreadRef<MainThread.Element>(null)
  const motionRef = useMainThreadRef<MotionState | null>(null)
  const [initialIndex] = useState(index)
  const reduceMotion = useSyncExternalStore(subscribeReduceMotion, getReduceMotion)
  const appearance = useSurfaceAppearance()
  const platform = getPlatformTarget()
  const androidLens = appearance.androidGlass && readLynxGlobal()?.__globalProps?.androidTabGlassSupported === true
  const iosLens = appearance.liquidGlass && readLynxGlobal()?.__globalProps?.iosTabGlassSupported === true
  const webLens = platform === 'web' && readLynxGlobal()?.__globalProps?.webTabGlassSupported === true
    && appearance.blur && !appearance.increaseContrast
  const webSceneLens = platform === 'web' && readLynxGlobal()?.__globalProps?.webGlassSceneSupported === true
    && appearance.blur && !appearance.increaseContrast
  const harmonyLens = platform === 'harmony' && readLynxGlobal()?.__globalProps?.harmonyTabGlassSupported === true
    && appearance.blur && !appearance.increaseContrast

  const update = useMemo(() => runOnMainThread((target: number, slots: number, instant: boolean, dispose = false) => {
    'main thread'
    const previous = motionRef.current
    const now = Date.now()
    const pose = previous
      ? sampleTabSpring(previous.spring, now - previous.spring.startedAt)
      : { position: target, velocity: 0 }
    previous?.travel?.cancel()
    previous?.jelly?.cancel()
    previous?.light?.cancel()
    motionRef.current = null
    // A full-bar Android sampler keeps capture coordinates independent of the
    // moving capsule and excludes itself from the source. Native draws the
    // same sampled geometry as Element.animate(), without per-frame bridging.
    if (dispose) {
      opticalRef.current?.invoke('animateTabLens', { frames: [], count: slots, duration: 0 }).catch(() => {})
      return
    }
    const travel = travelRef.current
    const jelly = jellyRef.current
    if (!travel || !jelly) return
    // Store the resting pose below the animation, including unsupported hosts.
    travel.setStyleProperty('transform', `translateX(${target * 100}%)`)
    jelly.setStyleProperty('transform', 'scaleX(1) scaleY(1)')
    jelly.setStyleProperty('opacity', '1')
    lightRef.current?.setStyleProperty('opacity', '0')
    const engagement = previous ? sampleTabEngagement(previous.spring, now - previous.spring.startedAt) : 0
    const spring = { from: pose.position, target, velocity: pose.velocity, engagement, startedAt: now }
    if (instant || !previous || typeof travel.animate !== 'function' || typeof jelly.animate !== 'function') {
      opticalRef.current?.invoke('animateTabLens', { frames: [], count: slots, duration: 0 }).catch(() => {})
      motionRef.current = { spring: { ...spring, from: target, velocity: 0, engagement: 0, startedAt: now - TAB_SETTLE_MS } }
      return
    }
    const frames = tabSpringFrames(spring, slots)
    opticalRef.current?.invoke('animateTabLens', { frames: frames.optics, count: slots, duration: TAB_SETTLE_MS, startedAt: now }).catch(() => {})
    const options = { duration: TAB_SETTLE_MS, easing: 'linear', fill: 'forwards' as const }
    motionRef.current = { spring, travel: travel.animate(frames.travel, options), jelly: jelly.animate(frames.jelly, options), light: lightRef.current?.animate(frames.light, options) }
  }), [])

  useEffect(() => { update(index, count, reduceMotion, false) }, [index, count, reduceMotion, androidLens, webLens, webSceneLens, iosLens, harmonyLens, update])
  useEffect(() => () => { update(0, 1, true, true) }, [update])

  return (
    <>
      <view className='shell__tab-backdrop' id='songloft-tab-backdrop' flatten={false}>
        {backdrop}
      </view>
      <view
        className='nav-indicator'
        main-thread:ref={travelRef}
        accessibility-element={false}
        style={{ width: `calc(100% / ${count})`, transform: `translateX(${initialIndex * 100}%)` }}
      >
        <view
          className={`nav-indicator__pill${iosLens ? ' nav-indicator__pill--ios-glass' : ''}`}
          id={androidLens ? 'songloft-tab-selection' : undefined}
          flatten={androidLens ? false : undefined}
          main-thread:ref={jellyRef}
        >
          {iosLens ? (
            <songloft-tab-glass
              className='nav-indicator__glass'
              main-thread:ref={opticalRef}
              ios-user-interface-style={appearance.theme}
              accessibility-element={false}
            />
          ) : null}
          {iosLens ? <view className='nav-indicator__wash' accessibility-element={false} /> : null}
          {webLens || webSceneLens ? (
            <blur-view
              className={`nav-indicator__glass nav-indicator__glass--web${webSceneLens ? ' nav-indicator__glass--web-scene' : ''}`}
              main-thread:ref={opticalRef}
              data-tabcount={count}
              blur-radius='0px'
              songloft-tab-web-lens={true}
              accessibility-element={false}
            />
          ) : null}
          {appearance.blur && !appearance.increaseContrast ? (
            <view
              className='nav-indicator__light'
              id={androidLens ? 'songloft-tab-light' : undefined}
              flatten={androidLens ? false : undefined}
              main-thread:ref={lightRef}
              accessibility-element={false}
            />
          ) : null}
        </view>
      </view>
      {androidLens ? (
        <blur-view
          className='nav-indicator__optics'
          main-thread:ref={opticalRef}
          blur-radius='0px'
          enable-auto-blur={false}
          blur-sampling={1}
          android-capture-target='songloft-tab-backdrop'
          songloft-tab-lens={true}
          songloft-glass-light={appearance.theme === 'light' ? 0.55 : 0.35}
          accessibility-element={false}
        />
      ) : null}
      {harmonyLens ? (
        <songloft-tab-glass
          className='nav-indicator__optics'
          main-thread:ref={opticalRef}
          songloft-glass-light={appearance.theme === 'light' ? 0.55 : 0.35}
          accessibility-element={false}
        />
      ) : null}
      {children}
    </>
  )
}
