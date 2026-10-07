import '../../../shims/router-env.js'

import '@testing-library/jest-dom'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { act, render, screen } from '@lynx-js/react/testing-library'

import { ScrollingText } from '../ScrollingText.js'
import { marqueeSchedule, MARQUEE_PAUSE_MS, MARQUEE_VELOCITY } from '../scrolling-text-schedule.js'
import { changeSongTitleScrolling, songTitleScrolling } from '../scrolling-text-preference.js'
import { createMemoryStorage } from '../../../core/storage/memory-storage.js'
import { applySystemAppearance, setSystemAppearanceForTests } from '../../../native/system-appearance.js'
// Observe background → main-thread commands. The Vitest host has no real
// animated element refs; this verifies dispatch, not native animation execution.
const { mainThreadCalls } = vi.hoisted(() => ({ mainThreadCalls: [] as unknown[][] }))
vi.mock('@lynx-js/react', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  runOnMainThread: () => (...args: unknown[]) => {
    mainThreadCalls.push(args)
    return Promise.resolve()
  },
}))

afterEach(() => {
  songTitleScrolling.setState({ enabled: true })
  setSystemAppearanceForTests(null)
  vi.clearAllMocks()
  mainThreadCalls.length = 0
})

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

  test('开关实时控制所有标题的静态省略样式，保持完整文本', async () => {
    const storage = createMemoryStorage()
    render(<view><ScrollingText text='很长的标题一' /><ScrollingText text='很长的标题二' /></view>)
    await act(async () => { await changeSongTitleScrolling(false, storage) })
    for (const title of ['很长的标题一', '很长的标题二']) {
      expect(screen.getByText(title)).toHaveClass('scrolling-text__inner--static')
    }
    await act(async () => { await changeSongTitleScrolling(true, storage) })
    expect(screen.getByText('很长的标题一')).not.toHaveClass('scrolling-text__inner--static')
  })

  test('开关开启时系统减弱动效仍优先保持静态', async () => {
    render(<ScrollingText text='完整的长歌名' />)
    await act(async () => {
      applySystemAppearance({ theme: null, locale: null, reduceMotion: true })
    })
    expect(screen.getByText('完整的长歌名')).toHaveClass('scrolling-text__inner--static')
    await act(async () => {
      applySystemAppearance({ theme: null, locale: null, reduceMotion: false })
    })
    expect(screen.getByText('完整的长歌名')).not.toHaveClass('scrolling-text__inner--static')
  })

  test('关闭向主线程发送归零命令，再开启发送新的滚动计划', async () => {
    const host = lynx as unknown as { createSelectorQuery: unknown }
    const saved = host.createSelectorQuery
    host.createSelectorQuery = () => {
      let selector = ''
      const query = {
        select(value: string) { selector = value; return query },
        invoke({ success }: { success: (rect: { width: number }) => void }) {
          success({ width: selector.includes('outer') ? 100 : 300 })
          return query
        },
        exec() {},
      }
      return query
    }
    try {
      const storage = createMemoryStorage()
      await act(async () => { render(<ScrollingText text='已启动滚动的长歌名' />) })
      expect(mainThreadCalls.at(-1)).toEqual([[0, 0, -200, -200, 0], expect.any(Array), expect.any(Number)])
      await act(async () => { await changeSongTitleScrolling(false, storage) })
      expect(mainThreadCalls.at(-1)).toEqual([])
      await act(async () => { await changeSongTitleScrolling(true, storage) })
      expect(mainThreadCalls.at(-1)).toEqual([[0, 0, -200, -200, 0], expect.any(Array), expect.any(Number)])
    } finally {
      host.createSelectorQuery = saved
    }
  })
})
