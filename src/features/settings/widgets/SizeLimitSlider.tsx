import { useState } from '@lynx-js/react'
import {
  SliderIndicator,
  SliderRoot,
  SliderThumb,
  SliderTrack,
} from '@lynx-js/lynx-ui-slider'

import './SizeLimitSlider.css'

/** One notch of a size-limit slider: the stored byte value and its display label. */
export interface SizeLimitOption {
  bytes: number
  label: string
}

export interface SizeLimitSliderProps {
  /** Notches in ascending order. */
  options: SizeLimitOption[]
  /** Index of the selected notch, already resolved by the caller. */
  selectedIndex: number
  /** Fired once when a drag ends — including a tap that landed on the same notch. */
  onCommit: (bytes: number) => void
  /** Field label shown above the rail. */
  label?: string
  testId?: string
}

/**
 * Index of the notch nearest to `bytes` — exact match when it exists, otherwise
 * the closest by byte distance. For legacy stored values that sit between
 * notches (e.g. a 256 MB cap written by the pre-slider UI): they display on the
 * nearest notch and only snap for good once the user commits a new one.
 */
export function resolveNearestIndex(bytes: number, options: SizeLimitOption[]): number {
  let best = 0
  let bestDist = Number.POSITIVE_INFINITY
  for (let i = 0; i < options.length; i++) {
    const dist = Math.abs(options[i].bytes - bytes)
    if (dist < bestDist) {
      best = i
      bestDist = dist
    }
  }
  return best
}

/**
 * Index of the notch exactly matching `bytes`, or `fallback` when there is none.
 * A server config of `0` ("unlimited") or any custom value saved by an older
 * build lands on the fallback — same behavior as the Flutter `_findSizeIndex`.
 */
export function resolveExactIndex(
  bytes: number,
  options: SizeLimitOption[],
  fallback: number,
): number {
  const idx = options.findIndex((opt) => opt.bytes === bytes)
  return idx >= 0 ? idx : fallback
}

/**
 * Horizontal notched slider for cache size caps — the port of the Flutter cache
 * manager's `Slider(divisions: …)`: drag previews the notch under the thumb,
 * releasing commits it (the caller persists immediately, `onChangeEnd`-style),
 * and every notch carries a tick-mark dot like Flutter's divisions render.
 *
 * `SliderRoot` is 0–1; each notch maps to one `step` of `1/(N-1)`, so the visual
 * snap comes from the library and the byte mapping from us. Controlled mode
 * only ever receives drag-driven `onValueChange` events (the imperative ref API
 * throws there), so the handler needs no dragging guard — it can even be the
 * stale-closure first event of a drag, which is exactly the jump-to-tap frame.
 */
export function SizeLimitSlider({
  options,
  selectedIndex,
  onCommit,
  label,
  testId,
}: SizeLimitSliderProps) {
  const [dragging, setDragging] = useState(false)
  const [dragIndex, setDragIndex] = useState(selectedIndex)

  const count = options.length
  const activeIndex = dragging ? dragIndex : selectedIndex

  const indexFromRatio = (v: number): number => {
    if (!Number.isFinite(v) || count < 2) return 0
    return Math.min(count - 1, Math.max(0, Math.round(v * (count - 1))))
  }

  return (
    <view className='size-limit-slider' data-testid={testId}>
      <view className='size-limit-slider__head'>
        {label ? <text className='size-limit-slider__label'>{label}</text> : null}
        <text
          className='size-limit-slider__value'
          data-testid={testId ? `${testId}-value` : undefined}
        >
          {options[activeIndex]?.label ?? ''}
        </text>
      </view>
      <SliderRoot
        className='size-limit-slider__root'
        value={count > 1 ? activeIndex / (count - 1) : 0}
        step={count > 1 ? 1 / (count - 1) : 1}
        // Fires with the thumb's current ratio at drag start and end. Seeding
        // `dragIndex` here is what makes a jump-to-tap read correctly on the very
        // first frame — the paired `onValueChange` runs in the same native event
        // with a pre-drag closure, so it cannot rely on `dragging` yet.
        onDragging={(v: number) => {
          setDragIndex(indexFromRatio(v))
          setDragging(true)
        }}
        onValueChange={(v: number) => {
          setDragIndex(indexFromRatio(v))
        }}
        onValueCommit={(v: number) => {
          const idx = indexFromRatio(v)
          setDragIndex(idx)
          setDragging(false)
          onCommit(options[idx]?.bytes ?? options[selectedIndex]?.bytes ?? 0)
        }}
      >
        <SliderTrack className='size-limit-slider__track'>
          <SliderIndicator className='size-limit-slider__indicator' />
          {/* Notch tick marks — one dot per division, as Flutter's `Slider`
              paints them. The positioning trio copies the library's own thumb
              wrapper verbatim (inline `top: 50%` + `translate(-50%, -50%)`):
              that is the geometry proven to center on the rail, so each dot
              lands exactly where the thumb snaps. Active-side dots take the
              fill's contrast color (Flutter's onPrimary); the thumb itself
              (library zIndex 1) covers the current notch's dot. */}
          {count > 1
            ? options.map((opt, i) => (
              <view
                key={opt.bytes}
                className={
                  i <= activeIndex
                    ? 'size-limit-slider__tick size-limit-slider__tick--active'
                    : 'size-limit-slider__tick'
                }
                style={{
                  position: 'absolute',
                  top: '50%',
                  left: `${(100 * i) / (count - 1)}%`,
                  transform: 'translate(-50%, -50%)',
                }}
                data-testid={testId ? `${testId}-tick-${i}` : undefined}
              />
            ))
            : null}
          <SliderThumb className='size-limit-slider__thumb' />
        </SliderTrack>
      </SliderRoot>
      <view className='size-limit-slider__scale'>
        <text className='size-limit-slider__scale-text'>{options[0]?.label}</text>
        <text className='size-limit-slider__scale-text'>{options[count - 1]?.label}</text>
      </view>
    </view>
  )
}
