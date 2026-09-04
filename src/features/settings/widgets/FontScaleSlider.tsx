import { useState } from '@lynx-js/react'
import {
  SliderIndicator,
  SliderRoot,
  SliderThumb,
  SliderTrack,
} from '@lynx-js/lynx-ui-slider'

import type { FontScaleOption } from '../../../shared/theme/font-scale-model.js'
import './FontScaleSlider.css'

export interface FontScaleSliderProps {
  /** Notches in ascending size order (small → xlarge). */
  options: readonly FontScaleOption[]
  /** Index of the selected notch. */
  selectedIndex: number
  /** Label for a notch (already translated). */
  labelFor: (option: FontScaleOption) => string
  /** Fired when a drag/tap commits onto a notch. */
  onCommit: (option: FontScaleOption) => void
  testId?: string
}

/**
 * iOS-style "Text Size" control — the `A — A` slider from Settings ▸ Display &
 * Brightness ▸ Text Size, replacing the former discrete checkmark rows. A drag
 * previews the notch under the thumb; releasing commits it (Apple commits on
 * release too). A small "A" anchors the left end, a large "A" the right.
 *
 * Same controlled-slider mechanics as `SizeLimitSlider`: `SliderRoot` is 0–1 and
 * each notch maps to one `step` of `1/(N-1)`.
 */
export function FontScaleSlider({
  options,
  selectedIndex,
  labelFor,
  onCommit,
  testId,
}: FontScaleSliderProps) {
  const [dragging, setDragging] = useState(false)
  const [dragIndex, setDragIndex] = useState(selectedIndex)

  const count = options.length
  const activeIndex = dragging ? dragIndex : selectedIndex

  const indexFromRatio = (v: number): number => {
    if (!Number.isFinite(v) || count < 2) return 0
    return Math.min(count - 1, Math.max(0, Math.round(v * (count - 1))))
  }

  return (
    <view className='font-scale-slider' data-testid={testId}>
      <view className='font-scale-slider__value'>
        {labelFor(options[activeIndex] ?? options[selectedIndex] ?? 'default')}
      </view>
      <view className='font-scale-slider__row'>
        {/* Small A — the minimum anchor, footnote size. */}
        <text className='font-scale-slider__a font-scale-slider__a--min'>A</text>
        <SliderRoot
          className='font-scale-slider__root'
          value={count > 1 ? activeIndex / (count - 1) : 0}
          step={count > 1 ? 1 / (count - 1) : 1}
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
            const opt = options[idx] ?? options[selectedIndex]
            if (opt) onCommit(opt)
          }}
        >
          <SliderTrack className='font-scale-slider__track'>
            <SliderIndicator className='font-scale-slider__indicator' />
            {/* Notch tick marks — one per division, as Apple's discrete slider. */}
            {count > 1
              ? options.map((opt, i) => (
                <view
                  key={opt}
                  className={
                    i <= activeIndex
                      ? 'font-scale-slider__tick font-scale-slider__tick--active'
                      : 'font-scale-slider__tick'
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
            <SliderThumb className='font-scale-slider__thumb' />
          </SliderTrack>
        </SliderRoot>
        {/* Large A — the maximum anchor, title2 size. */}
        <text className='font-scale-slider__a font-scale-slider__a--max'>A</text>
      </view>
    </view>
  )
}
