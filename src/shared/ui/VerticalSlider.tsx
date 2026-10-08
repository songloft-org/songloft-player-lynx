import { useCallback, useRef } from '@lynx-js/react'
import type { NodesRef } from '@lynx-js/types'

import { isWebPlatform } from '../../native/web-platform.js'
import { pointerYFromEvent, ratioFromY } from './vertical-slider.js'
import './VerticalSlider.css'

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
        // The track carries no transforms, but keep this on so the rect matches
        // what is actually rendered if that ever changes.
        params: { androidEnableTransformProps: true },
        success: (res) => resolve(res as { top: number; height: number }),
        fail: (err) => reject(err),
      })
      .exec()
  })
}

export interface VerticalSliderProps {
  /** Current position as a 0..1 ratio, bottom to top. */
  value: number
  /** Called with the dragged-to 0..1 ratio on every pointer move. */
  onChange: (ratio: number) => void
  /**
   * Classes for the four boxes. The stylesheet here only supplies the geometry
   * that makes a vertical slider a vertical slider (which box is positioned
   * against which, which edge the fill grows from); **sizes and colours are the
   * caller's**, because the two call sites want different ones and a base rule
   * that set them would win or lose by stylesheet order rather than by intent.
   */
  className?: string
  trackClassName?: string
  indicatorClassName?: string
  thumbClassName?: string
  testId?: string
}

/**
 * A vertical drag surface: track + bottom-anchored fill + thumb.
 *
 * Hand-rolled because both Lynx's `<slider>` and lynx-ui's are horizontal-only —
 * see the header of `vertical-slider.ts` for why a rotated one is not an option.
 * Three things broke the earlier attempts at this and are handled here:
 *
 * 1. **Measurement.** The first version called `el.getBoundingClientRect()`
 *    synchronously, but Lynx refs have no such method — measurement is only
 *    available through the async `boundingClientRect` invoke. The call produced
 *    nothing and every drag computed `NaN`. We now measure via
 *    `invokeBoundingRect` and buffer the first touch until the rect resolves
 *    (the same pattern lynx-ui's Slider uses).
 *
 * 2. **Gesture ownership.** These surfaces sit inside vertically scrollable
 *    parents (the EQ page's and volume popover's `scroll-view`), which would
 *    otherwise claim the vertical swipe and scroll instead of
 *    moving the slider. `consume-slide-event` tells the native layer this surface
 *    consumes the swipe, and the `catch*` handlers stop it bubbling.
 *
 * 3. **Pointer type + coordinate space.** On Web a mouse emits `mouse*` events,
 *    not `touch*`, so mouse handlers are bound too (guarded by a "button is
 *    down" flag, since `mousemove` also fires on hover). And the Y coordinate is
 *    read from the field that matches `boundingClientRect`'s space per platform —
 *    `pointerYFromEvent` owns that choice.
 *
 * We re-measure on every pointer-down because anything that scrolls or reopens
 * above the slider changes its viewport-relative `top`.
 */
export function VerticalSlider({
  value,
  onChange,
  className,
  trackClassName,
  indicatorClassName,
  thumbClassName,
  testId,
}: VerticalSliderProps) {
  const wrapRef = useRef<NodesRef>(null)
  const topRef = useRef(0)
  const heightRef = useRef(0)
  const measuredRef = useRef(false)
  const measuringRef = useRef(false)
  const pendingYRef = useRef<number | null>(null)
  // Only relevant to mouse input (Web): `mousemove` fires on hover as well, so
  // it must only drive the slider while a button is actually held.
  const mouseDownRef = useRef(false)
  // Platform is fixed for the session; read once to pick the pointer coordinate
  // field that matches `boundingClientRect`'s space (see `pointerYFromEvent`).
  const isWeb = useRef(isWebPlatform())

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
    const y = pointerYFromEvent(e, isWeb.current)
    if (!Number.isFinite(y)) return
    // A fresh measure on every pointer-down: the surface's viewport-relative
    // `top` changes whenever something around it scrolls or moves.
    pendingYRef.current = y
    measuredRef.current = false
    measure()
  }, [measure])

  const handleMove = useCallback((e: unknown) => {
    const y = pointerYFromEvent(e, isWeb.current)
    if (!Number.isFinite(y)) return
    if (!measuredRef.current || heightRef.current <= 0) {
      pendingYRef.current = y
      measure()
      return
    }
    applyY(y)
  }, [applyY, measure])

  const onMouseDown = useCallback((e: unknown) => {
    mouseDownRef.current = true
    handleStart(e)
  }, [handleStart])

  const onMouseMove = useCallback((e: unknown) => {
    if (!mouseDownRef.current) return
    handleMove(e)
  }, [handleMove])

  const onPointerUp = useCallback(() => {
    mouseDownRef.current = false
  }, [])

  return (
    <view
      ref={wrapRef}
      className={className ? `vslider ${className}` : 'vslider'}
      consume-slide-event={[[-180, 180]]}
      catchtouchstart={handleStart}
      catchtouchmove={handleMove}
      catchtouchend={onPointerUp}
      catchtouchcancel={onPointerUp}
      catchmousedown={onMouseDown}
      catchmousemove={onMouseMove}
      catchmouseup={onPointerUp}
      global-bindmouseup={onPointerUp}
      data-testid={testId}
    >
      <view className={trackClassName ? `vslider__track ${trackClassName}` : 'vslider__track'}>
        <view
          className={indicatorClassName
            ? `vslider__indicator ${indicatorClassName}`
            : 'vslider__indicator'}
          style={{ height: `${value * 100}%` }}
        />
        <view
          className={thumbClassName ? `vslider__thumb ${thumbClassName}` : 'vslider__thumb'}
          style={{ bottom: `${value * 100}%` }}
        />
      </view>
    </view>
  )
}
