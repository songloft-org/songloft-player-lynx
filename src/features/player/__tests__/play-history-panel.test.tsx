import '../../../shims/router-env.js'

import { beforeEach, describe, expect, test, vi } from 'vitest'
import { fireEvent, getQueriesForElement, render } from '@lynx-js/react/testing-library'

import type { Song } from '../../../models/song.js'
import type { PlayHistoryEntry } from '../../../models/song.js'

/**
 * `PlayHistoryPanel` render + interaction. The query hook and the songs API are
 * mocked so each state (loading / error / empty / list) is reachable, but the
 * panel's own logic — which queue a tapped entry starts, the two-tap clear, the
 * per-entry delete — runs for real.
 */
const historyState: {
  data?: { items: PlayHistoryEntry[], total: number }
  isLoading: boolean
  isError: boolean
} = { data: undefined, isLoading: false, isError: false }
const refetch = vi.fn()

vi.mock('../data/play-history-query.js', () => ({
  playHistoryQueryKeys: {
    all: () => ['play-history'],
    forContext: (c: { type: string, key: string }) => ['play-history', c.type, c.key],
  },
  usePlayHistoryQuery: () => ({ ...historyState, refetch }),
}))

const clearPlayHistory = vi.fn(async () => 0)
const deletePlayHistoryEntry = vi.fn(async () => {})
vi.mock('../../library/api/index.js', () => ({
  getSongsApi: () => ({ clearPlayHistory, deletePlayHistoryEntry }),
}))

const playPlaylist = vi.fn(async () => {})
vi.mock('../store/index.js', () => ({
  usePlayerStore: { getState: () => ({ playPlaylist }) },
}))

const invalidateQueries = vi.fn()
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries }),
}))

vi.mock('react-i18next', async () =>
  (await import('../../../__tests__/_render-mocks.js')).mockReactI18next(),
)

vi.mock('../../../shared/ui/Icon.js', () => ({
  Icon: () => null,
  ICON_COLORS: { content: '#fff', content2: '#ccc', contentMuted: '#aaa', danger: '#f00' },
}))

const { PlayHistoryPanel } = await import('../widgets/PlayHistoryPanel.js')

function song(id: number, title: string): Song {
  return {
    id,
    type: 'local',
    title,
    artist: 'Artist',
    year: 0,
    duration: 30,
    fileSize: 0,
    bitRate: 0,
    sampleRate: 0,
    isLive: false,
    isVideo: false,
    addedAt: '',
    updatedAt: '',
  } as Song
}

function entry(id: number, title: string): PlayHistoryEntry {
  return { song: song(id, title), playCount: 2, playedAt: '2026-08-17T00:00:00Z' }
}

const CONTEXT = { type: 'artist' as const, key: '周杰伦' }

function renderPanel(queue?: Song[]) {
  const onClose = vi.fn()
  const result = render(
    <PlayHistoryPanel
      context={CONTEXT}
      title='“周杰伦” play history'
      queue={queue}
      onClose={onClose}
    />,
  )
  const q = getQueriesForElement(result.container as unknown as HTMLElement)
  const text = () => (result.container as unknown as { textContent: string }).textContent ?? ''
  return { onClose, q, text }
}

beforeEach(() => {
  vi.clearAllMocks()
  historyState.data = undefined
  historyState.isLoading = false
  historyState.isError = false
})

describe('PlayHistoryPanel states', () => {
  test('shows the title and a loading state while fetching', () => {
    historyState.isLoading = true
    const { text } = renderPanel()
    expect(text()).toContain('周杰伦')
    expect(text()).toContain('Loading')
  })

  test('shows an error with a retry that refetches', () => {
    historyState.isError = true
    const { q, text } = renderPanel()
    expect(text()).toContain('Could not load play history')
    fireEvent.tap(q.getByTestId('play-history-retry'), {})
    expect(refetch).toHaveBeenCalled()
  })

  test('shows the empty state with its hint, and no clear button', () => {
    historyState.data = { items: [], total: 0 }
    const { q, text } = renderPanel()
    expect(text()).toContain('No play history yet')
    expect(q.queryByTestId('play-history-clear')).toBeNull()
  })

  test('renders one row per entry with its play count', () => {
    historyState.data = { items: [entry(1, 'First'), entry(2, 'Second')], total: 2 }
    const { text } = renderPanel()
    expect(text()).toContain('First')
    expect(text()).toContain('Second')
    expect(text()).toContain('×2')
  })
})

describe('PlayHistoryPanel actions', () => {
  test('tapping an entry in the loaded queue plays it in place, with the context', () => {
    historyState.data = { items: [entry(2, 'Second')], total: 1 }
    const loaded = [song(1, 'First'), song(2, 'Second'), song(3, 'Third')]
    const { q, onClose } = renderPanel(loaded)

    fireEvent.tap(q.getByText('Second'), {})

    expect(playPlaylist).toHaveBeenCalledWith(loaded, 1, CONTEXT)
    expect(onClose).toHaveBeenCalled()
  })

  test('an entry outside the loaded pages is appended, so "next" still works', () => {
    historyState.data = { items: [entry(9, 'Offpage')], total: 1 }
    const loaded = [song(1, 'First')]
    const { q } = renderPanel(loaded)

    fireEvent.tap(q.getByText('Offpage'), {})

    const [queue, index, context] = playPlaylist.mock.calls[0] as unknown as [Song[], number, unknown]
    expect(queue.map((s) => s.id)).toEqual([1, 9])
    expect(index).toBe(1)
    expect(context).toEqual(CONTEXT)
  })

  test('clearing takes two taps', () => {
    historyState.data = { items: [entry(1, 'First')], total: 1 }
    const { q, text } = renderPanel()

    fireEvent.tap(q.getByTestId('play-history-clear'), {})
    // First tap only arms the confirm — the API must not be called yet.
    expect(clearPlayHistory).not.toHaveBeenCalled()
    expect(text()).toContain('Tap again to clear')

    fireEvent.tap(q.getByTestId('play-history-clear'), {})
    expect(clearPlayHistory).toHaveBeenCalledWith(CONTEXT)
  })

  test('removing an entry scopes the delete to this context and invalidates', async () => {
    historyState.data = { items: [entry(5, 'Fifth')], total: 1 }
    const { q } = renderPanel()

    fireEvent.tap(q.getByTestId('play-history-remove-5'), {})

    expect(deletePlayHistoryEntry).toHaveBeenCalledWith(CONTEXT, 5)
    await Promise.resolve()
    await Promise.resolve()
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['play-history', 'artist', '周杰伦'],
    })
  })

  test('tapping the backdrop closes', () => {
    historyState.data = { items: [], total: 0 }
    const { q, onClose } = renderPanel()
    fireEvent.tap(q.getByTestId('play-history-panel'), {})
    expect(onClose).toHaveBeenCalled()
  })
})
