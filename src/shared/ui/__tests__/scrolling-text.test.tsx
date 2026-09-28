import '../../../shims/router-env.js'

import '@testing-library/jest-dom'
import { describe, expect, test } from 'vitest'
import { render, screen } from '@lynx-js/react/testing-library'

import { ScrollingText } from '../ScrollingText.js'
import { marqueeSchedule, MARQUEE_PAUSE_MS, MARQUEE_VELOCITY } from '../scrolling-text-schedule.js'

/**
 * The marquee schedule is the only pure piece of ScrollingText — measurement and
 * the animation loop need the lynx host — so the round-trip math is pinned here:
 * keyframe offsets, normalized times and the velocity/pause contract shared with
 * the Flutter client's ScrollingText. The render case covers the no-bridge
 * fallback (Vitest has no `lynx.createSelectorQuery`): the text must render
 * whole and static instead of crashing or clipping.
 */
describe('marqueeSchedule', () => {
  test('往返五关键帧：起点停留、滚到末尾、停留、滚回', () => {
    const { x, times } = marqueeSchedule(60)
    expect(x).toEqual([0, 0, -60, -60, 0])
    expect(times[0]).toBe(0)
    expect(times[times.length - 1]).toBe(1)
    for (let i = 1; i < times.length; i++) {
      expect(times[i]).toBeGreaterThan(times[i - 1])
    }
  })

  test('总时长 = 两端暂停 + 按 30px/s 的往返滚动', () => {
    const overflow = 90
    const { durationMs, times } = marqueeSchedule(overflow)
    const scrollMs = (overflow / MARQUEE_VELOCITY) * 1000
    expect(durationMs).toBe(2 * MARQUEE_PAUSE_MS + 2 * scrollMs)
    // 首段停留占比 = pause / total
    expect(times[1]).toBeCloseTo(MARQUEE_PAUSE_MS / durationMs, 10)
  })

  test('溢出越大滚动占比越高（暂停固定 2s）', () => {
    const small = marqueeSchedule(30)
    const large = marqueeSchedule(300)
    const holdRatio = (s: ReturnType<typeof marqueeSchedule>) => s.times[1]
    expect(holdRatio(large)).toBeLessThan(holdRatio(small))
  })
})

describe('ScrollingText', () => {
  test('无测量桥接时静态渲染完整文本', () => {
    render(<ScrollingText text='孙子兵法与三十六计 第01集' textClassName='song-row__title' />)
    expect(screen.getByText('孙子兵法与三十六计 第01集')).toBeInTheDocument()
  })
})
