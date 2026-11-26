import { expect, test, vi } from 'vitest'
import { act, fireEvent, render, waitFor } from '@lynx-js/react/testing-library'

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => vi.fn() }))
vi.mock('../store/index.js', () => ({
  usePlayerStore: (select: (state: object) => unknown) => select({ seek: vi.fn() }),
  useLyricStore: (select: (state: object) => unknown) => select({
    lyrics: Array.from({ length: 20 }, (_, index) => ({ text: 'Line ' + index, timeMs: index * 1000 })),
    currentIndex: 0,
    synced: true,
    translationMap: new Map(),
    romanizationMap: new Map(),
  }),
}))
import { LyricsView } from '../widgets/LyricsView.js'

function nodesRefPrototype() {
  const query = lynx.createSelectorQuery() as unknown as { selectUniqueID: (id: number) => object }
  return Object.getPrototypeOf(query.selectUniqueID(0))
}

test('scrolling away from the current lyric exposes the return button', async () => {
  const invoke = vi.spyOn(nodesRefPrototype(), 'invoke').mockReturnValue({ exec: vi.fn() })
  try {
    render(<LyricsView />)
    expect(invoke).toHaveBeenCalledWith(expect.objectContaining({ method: 'scrollIntoView' }))
    const scroller = lynx.createSelectorQuery().select('.player-lyrics')
    await act(async () => {
      fireEvent.touchstart(scroller as unknown as Element, { detail: { x: 10, y: 100 } })
      fireEvent.touchmove(scroller as unknown as Element, { detail: { x: 10, y: 180 } })
    })
    expect(elementTree.root!.querySelector('[data-testid="lyrics-back-to-current"]')).not.toBeNull()
  } finally {
    invoke.mockRestore()
  }
})

test('scroll events without a wheel gesture pause follow only after the current line leaves the viewport', async () => {
  const viewport = { top: 100, height: 400 }
  const line = { top: 200, height: 30 }
  let rect = 0
  const invoke = vi.spyOn(nodesRefPrototype(), 'invoke').mockImplementation((...args) => {
    const request = args[0] as { method: string; success?: (box: typeof viewport) => void }
    return {
      exec() {
        if (request.method === 'boundingClientRect') request.success?.(rect++ % 2 === 0 ? viewport : line)
      },
    }
  })
  try {
    render(<LyricsView />)
    const scroller = lynx.createSelectorQuery().select('.player-lyrics') as unknown as Element
    await act(async () => { fireEvent.scroll(scroller, { detail: { scrollTop: 200 } }) })
    await waitFor(() => expect(rect).toBe(2))
    const button = () => elementTree.root!.querySelector('[data-testid="lyrics-back-to-current"]')
    expect(button()).toBeNull()
    line.top = 20
    await act(async () => { fireEvent.scroll(scroller, { detail: { scrollTop: 700 } }) })
    await waitFor(() => {
      expect(rect).toBe(4)
      expect(button()).not.toBeNull()
    })
  } finally {
    invoke.mockRestore()
  }
})
