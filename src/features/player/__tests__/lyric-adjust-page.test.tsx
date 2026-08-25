import '../../../shims/router-env.js'
import '@testing-library/jest-dom'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { act, fireEvent, getQueriesForElement, render } from '@lynx-js/react/testing-library'

/*
 * The lyric timing adjust page, ported from the Flutter `LyricAdjustPage`:
 * a global-offset card (slider + quick nudges) over the parsed LRC lines, a
 * ±100 ms nudge per line, discard confirmation on unsaved changes, and a save
 * that re-assembles the LRC and PUTs it with `lyric_source: 'manual'`.
 */
const { updateLyricsSpy, removeCachedLyricSpy, loadForSongSpy } = vi.hoisted(() => ({
  updateLyricsSpy: vi.fn(
    async (): Promise<{ fileWriteStatus?: string }> => ({ fileWriteStatus: undefined }),
  ),
  removeCachedLyricSpy: vi.fn(async () => {}),
  loadForSongSpy: vi.fn(async () => {}),
}))

vi.mock('react-i18next', async () =>
  (await import('../../../__tests__/_render-mocks.js')).mockReactI18next(),
)
vi.mock('@lynx-js/lynx-ui-slider', async () =>
  (await import('../../../__tests__/_render-mocks.js')).mockLynxUiSlider(),
)
// ConfirmDialog's lynx-ui primitives — children render only while `show` is
// true (same stand-in shape as `play-history-panel.test.tsx`).
vi.mock('@lynx-js/lynx-ui-dialog', () => ({
  DialogRoot: ({ children, show }: { children: unknown; show: boolean }) =>
    (show ? <view>{children as never}</view> : null),
  DialogView: ({ children }: { children: unknown }) => <view>{children as never}</view>,
  DialogBackdrop: ({ children }: { children: unknown }) => <view>{children as never}</view>,
  DialogContent: ({ children }: { children: unknown }) => <view>{children as never}</view>,
  DialogClose: ({ children }: { children: unknown }) => <view>{children as never}</view>,
}))
vi.mock('../../library/api/index.js', () => ({
  getSongsApi: () => ({ updateLyrics: updateLyricsSpy }),
}))
vi.mock('../data/lyric-cache.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../data/lyric-cache.js')>()
  return { ...actual, removeCachedLyric: removeCachedLyricSpy }
})
vi.mock('../store/index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../store/index.js')>()
  const { makePlayerStoreMock, makeLyricStoreMock } = await import(
    '../../../__tests__/_render-mocks.js'
  )
  return {
    ...actual,
    usePlayerStore: makePlayerStoreMock(actual).usePlayerStore,
    // `loadForSong` is overridden with a spy so the post-save reload is
    // assertable; everything else is the standard render-mock state.
    useLyricStore: makeLyricStoreMock(actual, {
      rawLyric: '[00:01.000]first\n[00:02.500]second\n',
      loadForSong: loadForSongSpy,
    }).useLyricStore,
  }
})

const { LyricAdjustPage } = await import('../pages/LyricAdjustPage.js')
const { mockSong } = await import('../../../__tests__/_render-mocks.js')
const { useToastStore, toast } = await import('../../../shared/ui/toast-store.js')
const { resetBackRouterForTests, setBackRouter } = await import(
  '../../../core/navigation/route-back-action.js'
)

// `makePlayerStoreMock`'s built-in current song (id 1) is what the page sees.
const currentSong = mockSong()

async function renderPage() {
  render(<LyricAdjustPage />)
  await act(async () => { await new Promise(r => setTimeout(r, 10)) })
  return getQueriesForElement(elementTree.root!)
}

beforeEach(() => {
  updateLyricsSpy.mockReset()
  updateLyricsSpy.mockResolvedValue({ fileWriteStatus: undefined })
  removeCachedLyricSpy.mockClear()
  loadForSongSpy.mockClear()
})

afterEach(() => {
  toast.clear()
  resetBackRouterForTests()
})

describe('rendering', () => {
  test('shows the global offset card and every parsed line with its timestamp', async () => {
    const { queryByText, queryByTestId } = await renderPage()

    expect(queryByText('Adjust lyrics')).toBeInTheDocument()
    expect(queryByText('Global offset')).toBeInTheDocument()
    expect(queryByTestId('lyric-adjust-global-value')).toHaveTextContent('+0ms')

    // Two parsed lines, each with the adjusted timestamp readout.
    expect(queryByText('[00:01.000]')).toBeInTheDocument()
    expect(queryByText('[00:02.500]')).toBeInTheDocument()
    expect(queryByText('first')).toBeInTheDocument()
    expect(queryByText('second')).toBeInTheDocument()

    // Per-line nudge buttons for both rows.
    expect(queryByTestId('lyric-adjust-line-0-minus')).toBeInTheDocument()
    expect(queryByTestId('lyric-adjust-line-0-plus')).toBeInTheDocument()
    expect(queryByTestId('lyric-adjust-line-1-minus')).toBeInTheDocument()
    expect(queryByTestId('lyric-adjust-line-1-plus')).toBeInTheDocument()
  })
})

describe('adjustments', () => {
  test('global quick nudges move the offset readout', async () => {
    const { getByTestId } = await renderPage()

    fireEvent.tap(getByTestId('lyric-adjust-nudge-500'), {})
    expect(getByTestId('lyric-adjust-global-value')).toHaveTextContent('+500ms')

    fireEvent.tap(getByTestId('lyric-adjust-nudge--100'), {})
    expect(getByTestId('lyric-adjust-global-value')).toHaveTextContent('+400ms')
  })

  test('per-line nudges shift only that line and show its delta', async () => {
    const { getByTestId, queryByText } = await renderPage()

    fireEvent.tap(getByTestId('lyric-adjust-line-1-plus'), {})
    expect(queryByText('[00:02.600]')).toBeInTheDocument()
    expect(queryByText('Line offset +100ms')).toBeInTheDocument()

    // The other line keeps its base timestamp.
    expect(queryByText('[00:01.000]')).toBeInTheDocument()

    fireEvent.tap(getByTestId('lyric-adjust-line-1-minus'), {})
    expect(queryByText('[00:02.500]')).toBeInTheDocument()
    expect(queryByText('Line offset +100ms')).not.toBeInTheDocument()
  })

  test('reset clears every adjustment', async () => {
    const { getByTestId, queryByText } = await renderPage()

    fireEvent.tap(getByTestId('lyric-adjust-nudge--500'), {})
    fireEvent.tap(getByTestId('lyric-adjust-line-0-plus'), {})
    // 1000ms base - 500ms global + 100ms line = 600ms.
    expect(queryByText('[00:00.600]')).toBeInTheDocument()

    fireEvent.tap(getByTestId('lyric-adjust-reset'), {})
    expect(getByTestId('lyric-adjust-global-value')).toHaveTextContent('+0ms')
    expect(queryByText('[00:01.000]')).toBeInTheDocument()
  })
})

describe('saving', () => {
  test('re-assembles the LRC with all adjustments and PUTs it as manual', async () => {
    updateLyricsSpy.mockResolvedValue({ fileWriteStatus: 'written' })
    const { getByTestId } = await renderPage()

    fireEvent.tap(getByTestId('lyric-adjust-nudge-500'), {})
    fireEvent.tap(getByTestId('lyric-adjust-line-1-plus'), {})

    fireEvent.tap(getByTestId('lyric-adjust-save'), {})
    await act(async () => { await new Promise(r => setTimeout(r, 10)) })

    expect(updateLyricsSpy).toHaveBeenCalledWith(currentSong.id, {
      lyricSource: 'manual',
      lyric: '[00:01.500]first\n[00:03.100]second\n',
    })
    // Cache evicted and the lyric reloaded for the current song.
    expect(removeCachedLyricSpy).toHaveBeenCalledWith(currentSong.id)
    expect(loadForSongSpy).toHaveBeenCalledWith(currentSong)
    // written → success toast.
    expect(useToastStore.getState().toast?.text).toBe('Saved and written to audio file')
  })

  test('maps each file_write_status to its toast tone', async () => {
    const { getByTestId } = await renderPage()

    updateLyricsSpy.mockResolvedValue({ fileWriteStatus: 'failed' })
    fireEvent.tap(getByTestId('lyric-adjust-nudge-100'), {})
    fireEvent.tap(getByTestId('lyric-adjust-save'), {})
    await act(async () => { await new Promise(r => setTimeout(r, 10)) })
    expect(useToastStore.getState().toast?.text)
      .toBe('Saved to database, but writing to the audio file failed')
    expect(useToastStore.getState().toast?.tone).toBe('error')

    toast.clear()
    updateLyricsSpy.mockResolvedValue({ fileWriteStatus: undefined })
    fireEvent.tap(getByTestId('lyric-adjust-nudge-100'), {})
    fireEvent.tap(getByTestId('lyric-adjust-save'), {})
    await act(async () => { await new Promise(r => setTimeout(r, 10)) })
    expect(useToastStore.getState().toast?.text).toBe('Saved to database (file not updated)')
    expect(useToastStore.getState().toast?.tone).toBe('success')
  })

  test('a failed save surfaces the error without navigating', async () => {
    updateLyricsSpy.mockRejectedValue(new Error('boom'))
    const { getByTestId } = await renderPage()

    fireEvent.tap(getByTestId('lyric-adjust-nudge-100'), {})
    fireEvent.tap(getByTestId('lyric-adjust-save'), {})
    await act(async () => { await new Promise(r => setTimeout(r, 10)) })

    expect(useToastStore.getState().toast?.tone).toBe('error')
    expect(useToastStore.getState().toast?.text).toContain('boom')
  })

  test('the save control is inert without changes', async () => {
    const { getByTestId } = await renderPage()

    fireEvent.tap(getByTestId('lyric-adjust-save'), {})
    await act(async () => { await new Promise(r => setTimeout(r, 10)) })

    expect(updateLyricsSpy).not.toHaveBeenCalled()
  })
})

describe('discard confirmation', () => {
  test('back with unsaved changes opens the confirm dialog instead of leaving', async () => {
    const navigate = vi.fn()
    setBackRouter({ state: { location: { pathname: '/player/lyrics/adjust' } }, navigate } as never)

    const { getByTestId, queryByText } = await renderPage()
    fireEvent.tap(getByTestId('lyric-adjust-nudge-100'), {})

    fireEvent.tap(getByTestId('lyric-adjust-back'), {})
    await act(async () => { await new Promise(r => setTimeout(r, 10)) })

    // The dialog is up and back did not navigate yet.
    expect(queryByText('Discard changes?')).toBeInTheDocument()
    expect(navigate).not.toHaveBeenCalled()
  })

  test('confirming the discard navigates back', async () => {
    const navigate = vi.fn()
    setBackRouter({ state: { location: { pathname: '/player/lyrics/adjust' } }, navigate } as never)

    const { getByTestId, queryByText } = await renderPage()
    fireEvent.tap(getByTestId('lyric-adjust-nudge-100'), {})

    fireEvent.tap(getByTestId('lyric-adjust-back'), {})
    await act(async () => { await new Promise(r => setTimeout(r, 10)) })

    // ConfirmDialog renders its actions with text buttons — find and tap the
    // discard action.
    expect(queryByText('Discard changes?')).toBeInTheDocument()
    const discard = queryByText('Discard')
    expect(discard).toBeInTheDocument()
    fireEvent.tap(discard!, {})
    await act(async () => { await new Promise(r => setTimeout(r, 10)) })

    expect(navigate).toHaveBeenCalledWith({ to: '/player' })
  })

  test('back without changes leaves immediately, no dialog', async () => {
    const navigate = vi.fn()
    setBackRouter({ state: { location: { pathname: '/player/lyrics/adjust' } }, navigate } as never)

    const { getByTestId, queryByText } = await renderPage()
    fireEvent.tap(getByTestId('lyric-adjust-back'), {})
    await act(async () => { await new Promise(r => setTimeout(r, 10)) })

    expect(queryByText('Discard changes?')).not.toBeInTheDocument()
    expect(navigate).toHaveBeenCalledWith({ to: '/player' })
  })
})
