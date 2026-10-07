import { animate } from '@lynx-js/motion'
import { runOnMainThread, useEffect, useMainThreadRef, useMemo, useState, useSyncExternalStore } from '@lynx-js/react'
import type { MainThread } from '@lynx-js/types'

import { getReduceMotion, subscribeReduceMotion } from '../theme/reduce-motion-model.js'
import { marqueeSchedule } from './scrolling-text-schedule.js'
import { getSongTitleScrolling, subscribeSongTitleScrolling } from './scrolling-text-preference.js'
import './ScrollingText.css'

export interface ScrollingTextProps {
  text: string
  /** Typography classes for the inner text node (font size/weight/color). */
  textClassName?: string
  /** Layout classes for the clipping outer box. */
  className?: string
}

let uidSeq = 0

/**
 * Single-line text that marquees horizontally when it overflows its box, so
 * long same-prefix song titles stay readable in lists (songloft-org/songloft-player#46).
 * Static when it fits, when disabled in playback settings, when the host has
 * no measurement bridge, or under reduce-motion.
 */
export function ScrollingText({ text, textClassName, className }: ScrollingTextProps) {
  const innerRef = useMainThreadRef<MainThread.Element>(null)
  const [uid] = useState(() => ++uidSeq)
  const [reduceMotion, setReduceMotion] = useState(getReduceMotion)
  const enabled = useSyncExternalStore(subscribeSongTitleScrolling, getSongTitleScrolling)
  const staticText = !enabled || reduceMotion
  const outerId = `scrolling-text-outer-${uid}`
  const innerId = `scrolling-text-inner-${uid}`

  useEffect(() => subscribeReduceMotion(() => setReduceMotion(getReduceMotion())), [])

  // Main-thread marquee entry points. Worklets must stay stateless — module-scope
  // objects do not survive into the worklet realm — so cancellation leans on
  // motion's own overwrite rule: a new animation on the same element replaces the
  // running one. Restart = start a fresh loop; stop = overwrite with a zero-length
  // settle at x 0; unmount needs nothing (the element takes its animation with it).
  // Memoized once: runOnMainThread yields a fresh callable each call, so leaving
  // these un-memoized would put new identities in the effect deps and re-run the
  // marquee (resetting it to the start) on every parent re-render — e.g. each
  // playback-progress tick. The worklets close over innerRef, which is stable.
  const { start: startMarquee, settle: settleMarquee } = useMemo(
    () => ({
      start: runOnMainThread((x: number[], times: number[], durationSec: number) => {
        'main thread'
        const el = innerRef.current
        if (!el || typeof animate !== 'function') return
        animate(el, { x }, { duration: durationSec, times, repeat: Infinity, ease: 'linear' })
      }),
      settle: runOnMainThread(() => {
        'main thread'
        const el = innerRef.current
        if (!el || typeof animate !== 'function') return
        animate(el, { x: 0 }, { duration: 0 })
      }),
    }),
    [],
  )

  useEffect(() => {
    if (staticText) {
      settleMarquee()
      return
    }
    let cancelled = false

    const overflow = (): Promise<number> =>
      new Promise((resolve) => {
        try {
          // Bare host global, same rule as anchored-overlay's measurement.
          if (typeof lynx === 'undefined' || typeof lynx.createSelectorQuery !== 'function') {
            resolve(0)
            return
          }
          let outerWidth: number | null = null
          let innerWidth: number | null = null
          let settled = 0
          const settle = () => {
            if (++settled < 2) return
            resolve(
              outerWidth != null && innerWidth != null
                ? Math.max(0, innerWidth - outerWidth)
                : 0,
            )
          }
          lynx
            .createSelectorQuery()
            .select(`#${outerId}`)
            .invoke({
              method: 'boundingClientRect',
              success: (res: unknown) => { outerWidth = (res as { width: number }).width; settle() },
              fail: () => settle(),
            })
            .select(`#${innerId}`)
            .invoke({
              method: 'boundingClientRect',
              success: (res: unknown) => { innerWidth = (res as { width: number }).width; settle() },
              fail: () => settle(),
            })
            .exec()
        } catch {
          // Hosts (and the Vitest env) without the invoke bridge throw rather
          // than report failure — stay static.
          resolve(0)
        }
      })

    void overflow().then((value) => {
      if (cancelled || value <= 0) return
      const schedule = marqueeSchedule(value)
      startMarquee(schedule.x, schedule.times, schedule.durationMs / 1000)
    })

    return () => {
      cancelled = true
      settleMarquee()
    }
  }, [text, staticText, outerId, innerId, startMarquee, settleMarquee])

  return (
    <view id={outerId} className={`scrolling-text${className ? ` ${className}` : ''}`}>
      <text
        id={innerId}
        main-thread:ref={innerRef}
        className={`scrolling-text__inner${textClassName ? ` ${textClassName}` : ''}${staticText ? ' scrolling-text__inner--static' : ''}`}
      >
        {text}
      </text>
    </view>
  )
}
