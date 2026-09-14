import { useCallback, useRef, useState } from '@lynx-js/react'
import type { NodesRef } from '@lynx-js/types'

import { isWebPlatform } from '../../../native/web-platform.js'
import { pointerXFromEvent, ratioFromX } from '../../../shared/ui/horizontal-slider.js'
import './SeekBar.css'

function invokeBoundingRect(ref: NodesRef): Promise<{ left: number; width: number }> {
  return new Promise((resolve, reject) => {
    ref
      .invoke({
        method: 'boundingClientRect',
        params: { androidEnableTransformProps: true },
        success: (res) => resolve(res as { left: number; width: number }),
        fail: (err) => reject(err),
      })
      .exec()
  })
}

export interface SeekBarProps {
  /** Live playback progress 0..1. */
  value: number
  /** Committed on release with the dragged-to 0..1 ratio. */
  onSeek: (ratio: number) => void
  /** Called for each drag preview so the caller can show the scrub time. */
  onPreview?: (ratio: number | null) => void
  testId?: string
}

/**
 * Horizontal seek surface. Mirrors `VerticalSlider` (async
 * `boundingClientRect`, first-move buffering) but commits only on release so
 * dragging previews without spamming `seek` on the audio/video engine.
 */
export function SeekBar({ value, onSeek, onPreview, testId }: SeekBarProps) {
  const wrapRef = useRef<NodesRef>(null)
  const leftRef = useRef(0)
  const widthRef = useRef(0)
  const measuredRef = useRef(false)
  const measuringRef = useRef(false)
  const pendingXRef = useRef<number | null>(null)
  const mouseDownRef = useRef(false)
  const isWeb = useRef(isWebPlatform())
  const [scrub, setScrub] = useState<number | null>(null)

  const applyX = useCallback((x: number) => {
    const ratio = ratioFromX(x, leftRef.current, widthRef.current)
    if (ratio === null) return
    setScrub(ratio)
    onPreview?.(ratio)
  }, [onPreview])

  const flushPending = useCallback(() => {
    if (pendingXRef.current === null || !measuredRef.current) return
    const x = pendingXRef.current
    pendingXRef.current = null
    applyX(x)
  }, [applyX])

  const measure = useCallback(() => {
    if (measuringRef.current) return
    const ref = wrapRef.current
    if (!ref || typeof ref.invoke !== 'function') return
    measuringRef.current = true
    invokeBoundingRect(ref)
      .then((res) => {
        measuringRef.current = false
        const left = Number(res?.left)
        const width = Number(res?.width)
        if (Number.isFinite(left) && Number.isFinite(width) && width > 0) {
          leftRef.current = left
          widthRef.current = width
          measuredRef.current = true
        }
        flushPending()
      })
      .catch(() => {
        measuringRef.current = false
      })
  }, [flushPending])

  const handleStart = useCallback((e: unknown) => {
    const x = pointerXFromEvent(e, isWeb.current)
    if (!Number.isFinite(x)) return
    pendingXRef.current = x
    measuredRef.current = false
    measure()
  }, [measure])

  const handleMove = useCallback((e: unknown) => {
    const x = pointerXFromEvent(e, isWeb.current)
    if (!Number.isFinite(x)) return
    if (!measuredRef.current || widthRef.current <= 0) {
      pendingXRef.current = x
      measure()
      return
    }
    applyX(x)
  }, [applyX, measure])

  const handleEnd = useCallback(() => {
    mouseDownRef.current = false
    pendingXRef.current = null
    setScrub((current) => {
      if (current !== null) onSeek(current)
      return null
    })
    onPreview?.(null)
  }, [onSeek, onPreview])

  const onMouseDown = useCallback((e: unknown) => {
    mouseDownRef.current = true
    handleStart(e)
  }, [handleStart])

  const onMouseMove = useCallback((e: unknown) => {
    if (!mouseDownRef.current) return
    handleMove(e)
  }, [handleMove])

  const shown = scrub !== null ? scrub : value

  return (
    <view
      ref={wrapRef}
      className='seekbar'
      catchtouchstart={handleStart}
      catchtouchmove={handleMove}
      catchtouchend={handleEnd}
      catchtouchcancel={handleEnd}
      catchmousedown={onMouseDown}
      catchmousemove={onMouseMove}
      catchmouseup={handleEnd}
      global-bindmouseup={handleEnd}
      data-testid={testId}
    >
      <view className='seekbar__track'>
        <view className='seekbar__fill' style={{ width: `${shown * 100}%` }} />
        <view className='seekbar__thumb' style={{ left: `${shown * 100}%` }} />
      </view>
    </view>
  )
}