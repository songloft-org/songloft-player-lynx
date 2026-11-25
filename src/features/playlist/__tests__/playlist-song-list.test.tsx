import '@testing-library/jest-dom'
import { expect, test, vi } from 'vitest'
import { act, fireEvent, render } from '@lynx-js/react/testing-library'
import type { Song } from '../../../models/song.js'
import type { ScrollEvent } from '@lynx-js/types'
const scroll = vi.hoisted(() => ({ top: 24345, web: false }))
vi.mock('../../../native/web-platform.js', () => ({ isWebPlatform: () => scroll.web }))

vi.mock('../../library/widgets/VirtualList.js', () => ({
  VirtualList: ({ items, renderItem, onScroll }: { items: Song[];
    renderItem: (song: Song, index: number) => unknown; onScroll: (event: ScrollEvent) => void }) =>
    <view data-testid='actual-scroll' bindtap={() => onScroll({ detail: { scrollTop: scroll.top } } as ScrollEvent)}>
      {items.map((song, index) => <view key={String(song.id)}>{renderItem(song, index) as never}</view>)}
    </view>,
}))
vi.mock('../../../shared/ui/VerticalSlider.js', () => ({
  VerticalSlider: ({ onChange, value }: { onChange: (value: number) => void; value: number }) =>
    <view data-testid='seek' data-ratio={String(value)} bindtap={() => onChange(0.2)} />,
}))
const { PlaylistSongList } = await import('../widgets/PlaylistSongList.js')
const songs = Array.from({ length: 130 }, (_, index) => ({ id: index + 1, title: `夜曲 ${index + 1}` } as Song))

test('native seek waits for visible rows even when the invoke succeeds before the new layout commits', async () => {
  scroll.web = false
  vi.useFakeTimers()
  const host = lynx as unknown as { createSelectorQuery: unknown }
  const original = host.createSelectorQuery
  let committed = false
  let firstSong = 1
  const calls: unknown[] = []
  type Invoke = { method: string; params?: { position: number }; success?: (value: unknown) => void }
  const queryWith = (commands: Invoke[] = []) => ({
    select: () => ({ invoke: (args: Invoke) => queryWith([...commands, args]) }),
    exec: () => {
      for (const args of commands) {
        if (args.method === 'boundingClientRect') args.success?.({ top: 347, width: 390, height: 497 })
        if (args.method === 'scrollToPosition') {
          calls.push(args.params)
          if (committed) firstSong = (args.params?.position ?? 0) + 1
          args.success?.({})
        }
        if (args.method === 'getVisibleCells') args.success?.({ attachedCells: [
          { itemKey: String(firstSong), top: 0, bottom: 64 },
        ] })
      }
    },
  })
  host.createSelectorQuery = () => queryWith()
  try {
    const view = render(<PlaylistSongList items={songs} total={130} enabled hasMore={false}
      loadingMore={false} loadFailed={false} itemKey={song => String(song.id)}
      renderItem={song => <text>{song.title}</text>} />)
    await act(async () => { fireEvent.tap(view.container.querySelector('[data-testid="seek"]')!); await Promise.resolve() })
    expect(calls).toHaveLength(1)
    await act(async () => { await vi.advanceTimersByTimeAsync(200) })
    expect(calls).toHaveLength(2)
    expect(view.container.querySelector('.playlist-song-list__hint-count')).toHaveTextContent('1 / 130')
    expect(Number(view.container.querySelector('[data-testid="seek"]')!.getAttribute('data-ratio'))).toBeCloseTo(1 - 103 / 129)
    committed = true
    await act(async () => { await vi.advanceTimersByTimeAsync(200) })
    expect(view.container.querySelector('.playlist-song-list__hint-count')).toHaveTextContent('104 / 130')
    const settledCalls = calls.length
    await act(async () => { await vi.advanceTimersByTimeAsync(600) })
    expect(calls).toHaveLength(settledCalls)
    // A host that never lays out the target must stop retrying, too.
    committed = false
    firstSong = 1
    await act(async () => { fireEvent.tap(view.container.querySelector('[data-testid="seek"]')!); await Promise.resolve() })
    await act(async () => { await vi.advanceTimersByTimeAsync(6000) })
    const timedOutCalls = calls.length
    await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
    expect(calls).toHaveLength(timedOutCalls)
    await act(async () => { view.unmount(); await vi.advanceTimersByTimeAsync(1000) })
    expect(calls).toHaveLength(timedOutCalls)
  } finally { host.createSelectorQuery = original; vi.useRealTimers() }
})

test('dragging past loaded rows requests pagination, then scrolls to the real item and shows its initial', async () => {
  scroll.web = false
  vi.useFakeTimers()
  const host = lynx as unknown as { createSelectorQuery: unknown }
  const original = host.createSelectorQuery
  const calls: unknown[] = []
  let delayVisible = false
  let visibleSong = '1'
  const visibleCallbacks: Array<((value: unknown) => void) | undefined> = []
  type Invoke = { method: string; params?: unknown; success?: (value: unknown) => void }
  const queryWith = (commands: Invoke[] = []) => {
    const query = {
      select() { return { invoke: (args: Invoke) => queryWith([...commands, args]) } },
      exec() {
        for (const args of commands) {
          if (args.method === 'boundingClientRect') args.success?.({ top: 347, width: 390, height: 497 })
          if (args.method === 'scrollToPosition') { calls.push(args.params); args.success?.({}) }
          if (args.method === 'getVisibleCells') {
            if (delayVisible) visibleCallbacks.push(args.success)
            else args.success?.([{ itemKey: visibleSong, top: 347, bottom: 411 }])
          }
        }
      },
    }
    return query
  }
  const querySpy = vi.fn(() => queryWith())
  host.createSelectorQuery = querySpy
  try {
    const loadMore = vi.fn()
    const props = { total: 130, enabled: true, hasMore: true, loadFailed: false,
      loadingMore: false, itemKey: (song: Song) => String(song.id),
      renderItem: (song: Song) => <text>{song.title}</text>, onEndReached: loadMore }
    const view = render(<PlaylistSongList {...props} items={songs.slice(0, 30)} />)
    await act(async () => { fireEvent.tap(view.container.querySelector('[data-testid="seek"]')!); await Promise.resolve() })
    expect(loadMore).toHaveBeenCalledTimes(1)
    expect(calls).toHaveLength(0)
    expect(Number(view.container.querySelector('[data-testid="seek"]')!.getAttribute('data-ratio'))).toBeCloseTo(1 - 103 / 129)
    await act(async () => { view.rerender(<PlaylistSongList {...props} items={songs} />); await Promise.resolve() })
    expect(calls).toEqual([{ position: 103, itemKey: '104', alignTo: 'top', smooth: false }])
    expect(view.container.querySelector('.playlist-song-list__hint-count')).toHaveTextContent('1 / 130')
    visibleSong = '104'
    await act(async () => { fireEvent.tap(view.container.querySelector('[data-testid="actual-scroll"]')!); await Promise.resolve() })
    expect(view.container.querySelector('.playlist-song-list__hint-title')).toHaveTextContent('Y · 夜曲 104')
    expect(view.container.querySelector('.playlist-song-list__hint-count')).toHaveTextContent('104 / 130')
    delayVisible = true
    scroll.top = 51 * 64
    await act(async () => { fireEvent.tap(view.container.querySelector('[data-testid="actual-scroll"]')!); await Promise.resolve() })
    scroll.top = 24345
    await act(async () => { fireEvent.tap(view.container.querySelector('[data-testid="actual-scroll"]')!); await Promise.resolve() })
    expect(visibleCallbacks).toHaveLength(2)
    await act(async () => { visibleCallbacks[1]?.([{ itemKey: '89', top: 347, bottom: 411 }]); await Promise.resolve() })
    await act(async () => { visibleCallbacks[0]?.([{ itemKey: '104', top: 347, bottom: 411 }]); await Promise.resolve() })
    expect(view.container.querySelector('.playlist-song-list__hint-count')).toHaveTextContent('89 / 130')
    delayVisible = false
    visibleSong = '14'
    await act(async () => { fireEvent.tap(view.container.querySelector('[data-testid="actual-scroll"]')!); await Promise.resolve() })
    expect(view.container.querySelector('.playlist-song-list__hint-count')).toHaveTextContent('14 / 130')
    // Placeholder geometry settles without another scroll event.
    visibleSong = '104'
    await act(async () => { await vi.advanceTimersByTimeAsync(200) })
    expect(view.container.querySelector('.playlist-song-list__hint-count')).toHaveTextContent('104 / 130')
    visibleSong = '14'
    await act(async () => { fireEvent.tap(view.container.querySelector('[data-testid="actual-scroll"]')!); await Promise.resolve() })
    visibleCallbacks.length = 0
    delayVisible = true
    await act(async () => { await vi.advanceTimersByTimeAsync(600) })
    expect(visibleCallbacks).toHaveLength(3)
    // A later issued query must not starve a valid response when the viewport
    // has not moved; only an already-applied newer response supersedes it.
    await act(async () => { visibleCallbacks[1]?.([{ itemKey: '104', top: 347, bottom: 411 }]); await Promise.resolve() })
    expect(view.container.querySelector('.playlist-song-list__hint-count')).toHaveTextContent('104 / 130')
    await act(async () => { visibleCallbacks[0]?.([{ itemKey: '14', top: 347, bottom: 411 }]); await Promise.resolve() })
    expect(view.container.querySelector('.playlist-song-list__hint-count')).toHaveTextContent('104 / 130')
    const queriesBeforeUnmount = querySpy.mock.calls.length
    act(() => view.unmount())
    await act(async () => { await vi.advanceTimersByTimeAsync(400) })
    expect(querySpy).toHaveBeenCalledTimes(queriesBeforeUnmount)
  } finally { host.createSelectorQuery = original; vi.useRealTimers() }
})

test('Web waits for committed rows and reads actual row bounds even when the visible-cell cache is unavailable', async () => {
  scroll.web = true
  vi.useFakeTimers()
  const host = lynx as unknown as { createSelectorQuery: unknown }
  const original = host.createSelectorQuery
  let committed = false
  let firstSong = 1
  let rowHeight = 64
  let blockList = false
  let listReads = 0
  let pendingList: ((value: unknown) => void) | undefined
  const calls: unknown[] = []
  type Invoke = { selector: string; method: string; params?: { position: number }; success?: (value: unknown) => void; fail?: () => void }
  const queryWith = (commands: Invoke[] = []) => ({
    select: (selector: string) => ({ invoke: (args: Omit<Invoke, 'selector'>) => queryWith([...commands, { ...args, selector }]) }),
    exec: () => {
      for (const args of commands) {
        if (args.method === 'getVisibleCells') throw new Error('Web cache must not be consulted')
        if (args.method === 'scrollToPosition') {
          calls.push(args.params)
          if (committed) firstSong = (args.params?.position ?? 0) + 1
          args.success?.(undefined)
        }
        if (args.method === 'boundingClientRect') {
          const item = args.selector.match(/-item-(\d+)$/)
          if (!item) {
            listReads++
            if (blockList) pendingList = args.success
            else args.success?.({ top: 347, bottom: 844, width: 390, height: 497 })
          }
          else if (!committed && Number(item[1]) > 20) args.fail?.()
          else {
            const top = 347 + (Number(item[1]) - firstSong) * rowHeight
            args.success?.({ top, bottom: top + rowHeight })
          }
        }
      }
    },
  })
  const querySpy = vi.fn(() => queryWith())
  host.createSelectorQuery = querySpy
  try {
    const loadMore = vi.fn()
    const props = { total: 130, enabled: true, hasMore: true, loadFailed: false,
      loadingMore: false, itemKey: (song: Song) => String(song.id),
      renderItem: (song: Song) => <text>{song.title}</text>, onEndReached: loadMore }
    const view = render(<PlaylistSongList {...props} items={songs.slice(0, 30)} />)
    await act(async () => { fireEvent.tap(view.container.querySelector('[data-testid="seek"]')!); await Promise.resolve() })
    expect(loadMore).toHaveBeenCalledTimes(1)
    await act(async () => { view.rerender(<PlaylistSongList {...props} items={songs} />); await Promise.resolve() })
    await act(async () => { await vi.advanceTimersByTimeAsync(200) })
    expect(calls).toHaveLength(2)
    expect(view.container.querySelector('.playlist-song-list__hint-count')).toHaveTextContent('1 / 130')
    committed = true
    await act(async () => { await vi.advanceTimersByTimeAsync(200) })
    expect(view.container.querySelector('.playlist-song-list__hint-count')).toHaveTextContent('104 / 130')
    const settledCalls = calls.length
    firstSong = 14
    await act(async () => { await vi.advanceTimersByTimeAsync(200) })
    expect(view.container.querySelector('.playlist-song-list__hint-count')).toHaveTextContent('14 / 130')
    expect(calls).toHaveLength(settledCalls)
    rowHeight = 96
    firstSong = 89
    await act(async () => { await vi.advanceTimersByTimeAsync(200) })
    expect(view.container.querySelector('.playlist-song-list__hint-count')).toHaveTextContent('89 / 130')
    blockList = true
    const previousReads = listReads
    firstSong = 104
    await act(async () => { await vi.advanceTimersByTimeAsync(600) })
    expect(listReads - previousReads).toBe(1)
    blockList = false
    await act(async () => { pendingList?.({ top: 347, bottom: 844 }); await vi.advanceTimersByTimeAsync(0) })
    expect(view.container.querySelector('.playlist-song-list__hint-count')).toHaveTextContent('104 / 130')
    expect(listReads - previousReads).toBe(2)
    const beforeUnmount = querySpy.mock.calls.length
    act(() => view.unmount())
    await act(async () => { await vi.advanceTimersByTimeAsync(400) })
    expect(querySpy).toHaveBeenCalledTimes(beforeUnmount)
  } finally { host.createSelectorQuery = original; vi.useRealTimers() }
})
