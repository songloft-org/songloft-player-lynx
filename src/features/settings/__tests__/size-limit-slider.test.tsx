import '../../../shims/router-env.js'

import '@testing-library/jest-dom'
import { useState } from '@lynx-js/react'
import { afterEach, expect, test, vi } from 'vitest'
import { act, getQueriesForElement, render } from '@lynx-js/react/testing-library'

/**
 * SizeLimitSlider unit test.
 *
 * The lynx-ui slider stand-in here deliberately KEEPS the interaction callbacks
 * (unlike `_render-mocks.tsx`'s `mockLynxUiSlider`, whose Pass drops them): this
 * test drives the drag lifecycle — `onDragging` → `onValueChange` →
 * `onValueCommit` — exactly as `SliderRoot` emits it, and asserts what the
 * wrapper shows / commits at each step.
 */
const callbacks = vi.hoisted(() => ({
  onDragging: undefined as undefined | ((v: number) => void),
  onValueChange: undefined as undefined | ((v: number) => void),
  onValueCommit: undefined as undefined | ((v: number) => void),
}))

vi.mock('@lynx-js/lynx-ui-slider', () => ({
  // Records the latest render's callbacks so the test can fire them directly.
  SliderRoot: (props: {
    className?: string
    children?: unknown
    onDragging?: (v: number) => void
    onValueChange?: (v: number) => void
    onValueCommit?: (v: number) => void
  }) => {
    callbacks.onDragging = props.onDragging
    callbacks.onValueChange = props.onValueChange
    callbacks.onValueCommit = props.onValueCommit
    return <view className={props.className}>{props.children as never}</view>
  },
  SliderTrack: (props: { className?: string; children?: unknown }) => (
    <view className={props.className}>{props.children as never}</view>
  ),
  SliderIndicator: (props: { className?: string }) => <view className={props.className} />,
  SliderThumb: (props: { className?: string }) => <view className={props.className} />,
}))

const { SizeLimitSlider, resolveExactIndex, resolveNearestIndex } = await import(
  '../widgets/SizeLimitSlider.js'
)
import type { SizeLimitOption } from '../widgets/SizeLimitSlider.js'

const OPTIONS: SizeLimitOption[] = [
  { bytes: 100, label: '100 MB' },
  { bytes: 500, label: '500 MB' },
  { bytes: 1024, label: '1 GB' },
  { bytes: 2048, label: '2 GB' },
  { bytes: 5120, label: '5 GB' },
  { bytes: 10240, label: '10 GB' },
]

afterEach(() => {
  vi.clearAllMocks()
  callbacks.onDragging = undefined
  callbacks.onValueChange = undefined
  callbacks.onValueCommit = undefined
})

/**
 * Wrapper mirroring a real caller: `selectedIndex` is derived from committed
 * state, so a commit visibly moves the thumb only through the parent.
 */
function Harness({ initialIndex }: { initialIndex: number }) {
  const [index, setIndex] = useState(initialIndex)
  return (
    <SizeLimitSlider
      label='Max Cache Size'
      options={OPTIONS}
      selectedIndex={index}
      onCommit={(bytes) => {
        setIndex(OPTIONS.findIndex((o) => o.bytes === bytes))
      }}
      testId='slider'
    />
  )
}

async function renderHarness(initialIndex = 0) {
  render(<Harness initialIndex={initialIndex} />)
  await act(async () => {
    await Promise.resolve()
  })
  return getQueriesForElement(elementTree.root!)
}

test('renders label, selected value, and first/last scale labels', async () => {
  const { getByTestId, getByText } = await renderHarness(2)
  expect(getByTestId('slider-value').textContent).toBe('1 GB')
  expect(getByText('Max Cache Size')).toBeInTheDocument()
  // Scale ends flush with the rail.
  expect(getByText('100 MB')).toBeInTheDocument()
  expect(getByText('10 GB')).toBeInTheDocument()
})

test('renders one tick-mark dot per notch, active up to the selected one', async () => {
  const { getByTestId } = await renderHarness(2)
  // 6 options → 6 dots (Flutter's divisions tick marks).
  for (let i = 0; i < OPTIONS.length; i++) {
    expect(getByTestId(`slider-tick-${i}`)).toBeInTheDocument()
  }
  // Dots at or before the selected notch sit on the fill → active color.
  expect(getByTestId('slider-tick-2').className).toContain('size-limit-slider__tick--active')
  expect(getByTestId('slider-tick-1').className).toContain('size-limit-slider__tick--active')
  expect(getByTestId('slider-tick-3').className).not.toContain('size-limit-slider__tick--active')
  expect(getByTestId('slider-tick-5').className).not.toContain('size-limit-slider__tick--active')
})

test('drag lifecycle: preview follows the thumb, commit persists the notch', async () => {
  const { getByTestId } = await renderHarness(0)
  expect(getByTestId('slider-value').textContent).toBe('100 MB')

  // Drag start → notch 2 (0.4 of a 6-notch rail is exactly 2/5).
  await act(async () => {
    callbacks.onDragging!(0.4)
  })
  expect(getByTestId('slider-value').textContent).toBe('1 GB')

  // Continue dragging → notch 4.
  await act(async () => {
    callbacks.onValueChange!(0.75)
  })
  expect(getByTestId('slider-value').textContent).toBe('5 GB')
  // The drag preview also drives the tick colors (notch 4 now active-side).
  expect(getByTestId('slider-tick-4').className).toContain('size-limit-slider__tick--active')
  expect(getByTestId('slider-tick-5').className).not.toContain('size-limit-slider__tick--active')

  // Release on notch 4 → commit round-trips through the harness state.
  await act(async () => {
    callbacks.onValueCommit!(0.8)
  })
  expect(getByTestId('slider-value').textContent).toBe('5 GB')
})

test('mounting alone never fires onCommit', async () => {
  let committed = 0
  function NoCommitHarness() {
    const [index] = useState(0)
    return (
      <SizeLimitSlider
        options={OPTIONS}
        selectedIndex={index}
        onCommit={() => { committed += 1 }}
        testId='slider'
      />
    )
  }
  render(<NoCommitHarness />)
  await act(async () => {
    await Promise.resolve()
  })
  expect(committed).toBe(0)
})

test('resolveExactIndex: exact match wins, anything else falls back', () => {
  expect(resolveExactIndex(500, OPTIONS, 2)).toBe(1)
  expect(resolveExactIndex(0, OPTIONS, 2)).toBe(2) // unlimited → 1 GB notch
  expect(resolveExactIndex(123456789, OPTIONS, 2)).toBe(2) // custom → 1 GB notch
})

test('resolveNearestIndex: snaps to the closest notch by byte distance', () => {
  expect(resolveNearestIndex(256, OPTIONS)).toBe(0) // 256 MB legacy: nearer 100 than 500
  expect(resolveNearestIndex(350, OPTIONS)).toBe(1) // past midpoint → 500 MB
  expect(resolveNearestIndex(1024, OPTIONS)).toBe(2)
  expect(resolveNearestIndex(3 * 1024, OPTIONS)).toBe(3) // 3 GB → 2 GB
})
