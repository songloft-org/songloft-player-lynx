import '@testing-library/jest-dom'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { act, getQueriesForElement, render } from '@lynx-js/react/testing-library'

import { PLAYER_METRICS } from '../domain/player-layout.js'

/**
 * The player picks a different layout per screen class, and the sizes it draws come
 * from JS rather than CSS.
 *
 * `player-layout.test.ts` proves the numbers; this proves the page actually *uses*
 * them — that the split layout appears above `mobile`, the swiper and its dots only
 * below it, and that the resolved pixel values reach the elements. The two halves
 * matter separately: the table was right and unconsumed for a whole batch when this
 * page still hardcoded a 260px cover.
 *
 * The breakpoint hook is mocked rather than driven through `bindlayoutchange`, which
 * is the pattern `library-page.test.tsx` established — faking layout events in this
 * env exercises the env, not the page.
 */

const { breakpointHook, navigateSpy, autoEnterHook } = vi.hoisted(() => ({
  breakpointHook: vi.fn(),
  navigateSpy: vi.fn(),
  autoEnterHook: vi.fn(async () => false),
}))

vi.mock('react-i18next', async () =>
  (await import('../../../__tests__/_render-mocks.js')).mockReactI18next(),
)
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => navigateSpy }))
vi.mock('../../../shared/responsive/useBreakpoint.js', async () => {
  const actual = await vi.importActual<typeof import('../../../shared/responsive/useBreakpoint.js')>(
    '../../../shared/responsive/useBreakpoint.js',
  )
  return { ...actual, useBreakpoint: breakpointHook }
})
vi.mock('../../settings/data/settings-prefs.js', () => ({
  writeDefaultPlayMode: vi.fn(),
  readAudioQuality: vi.fn(async () => 'original'),
  readNormalize: vi.fn(async () => false),
  readPlaybackSpeed: vi.fn(async () => 1),
  writePlaybackSpeed: vi.fn(async () => {}),
  readAutoEnterLyrics: autoEnterHook,
}))
vi.mock('../../library/data/favorites.js', () => ({
  useIsFavorite: () => false,
  useFavoriteToggle: () => ({ isFavorite: false, toggle: vi.fn(), isPending: false }),
  getFavoriteState: async () => false,
  toggleFavoriteNonReact: async () => {},
}))
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useInfiniteQuery: () => ({ data: undefined, isLoading: false }),
  useQuery: () => ({ data: undefined, isLoading: false, isError: false, refetch: vi.fn() }),
  useMutation: () => ({ mutate: vi.fn(), isPending: false }),
}))
vi.mock('@lynx-js/lynx-ui-slider', async () =>
  (await import('../../../__tests__/_render-mocks.js')).mockLynxUiSlider(),
)
vi.mock('@lynx-js/lynx-ui-sheet', async () =>
  (await import('../../../__tests__/_render-mocks.js')).mockLynxUiSheet(),
)
vi.mock('@lynx-js/lynx-ui-sortable', async () =>
  (await import('../../../__tests__/_render-mocks.js')).mockLynxUiSortable(),
)
const swiperMock = (await import('../../../__tests__/_render-mocks.js')).mockLynxUiSwiper()
vi.mock('@lynx-js/lynx-ui-swiper', () => swiperMock)
vi.mock('../store/player-store.js', async () => {
  const actual = await vi.importActual<typeof import('../store/player-store.js')>(
    '../store/player-store.js',
  )
  const { makePlayerStoreMock } = await import('../../../__tests__/_render-mocks.js')
  return makePlayerStoreMock(actual)
})

/*
 * The player's overflow menu dispatches the song actions to the global
 * overlays store (app-root mount). The zustand hook cannot run in this env,
 * same crash class as the player store above.
 */
vi.mock('../../../shared/ui/song-row-overlays.js', () => ({
  useSongRowOverlays: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      menuSong: null,
      menuView: 'menu',
      deleteSong: null,
      openMenu: vi.fn(),
      closeMenu: vi.fn(),
      requestDelete: vi.fn(),
      cancelDelete: vi.fn(),
    }),
}))
vi.mock('../store/lyric-store.js', async () => {
  const actual = await vi.importActual<typeof import('../store/lyric-store.js')>(
    '../store/lyric-store.js',
  )
  const { makeLyricStoreMock } = await import('../../../__tests__/_render-mocks.js')
  return makeLyricStoreMock(actual)
})

const { FullPlayerPage } = await import('../pages/FullPlayerPage.js')

afterEach(() => {
  vi.clearAllMocks()
  autoEnterHook.mockResolvedValue(false)
})

/** Render at a given viewport, as the mocked hook would report it. */
async function renderAt(width: number, height: number, breakpoint: string) {
  breakpointHook.mockReturnValue({
    width,
    height,
    breakpoint,
    isWide: breakpoint !== 'mobile',
    onLayoutChange: vi.fn(),
  })
  render(<FullPlayerPage />)
  await act(async () => {
    await Promise.resolve()
  })
  return getQueriesForElement(elementTree.root!)
}

/** Like {@link renderAt} but keeps the handle, for tests that re-render. */
async function renderAtRaw(width: number, height: number, breakpoint: string) {
  breakpointHook.mockReturnValue({
    width,
    height,
    breakpoint,
    isWide: breakpoint !== 'mobile',
    onLayoutChange: vi.fn(),
  })
  const handle = render(<FullPlayerPage />)
  await act(async () => {
    await Promise.resolve()
  })
  return handle
}

/** Tall enough that the height budget never binds, so the table value is what shows. */
const TALL = 2000

describe('layout shape per screen class', () => {
  test('mobile swipes between cover and lyrics, with dots to say so', async () => {
    const { queryByTestId } = await renderAt(390, 844, 'mobile')

    expect(queryByTestId('page-dots')).toBeInTheDocument()
    // The split layout's cover column must not exist here.
    expect(elementTree.root!.querySelector('.full-player__stage-row')).toBeNull()
  })

  test.each([
    ['tablet', 700],
    ['desktop', 1200],
    ['tv', 2000],
  ])('%s shows cover and lyrics side by side, with no dots', async (breakpoint, width) => {
    const { queryByTestId } = await renderAt(width, TALL, breakpoint)

    expect(elementTree.root!.querySelector('.full-player__stage-row')).not.toBeNull()
    // Both screens are visible at once, so a page indicator would be meaningless.
    expect(queryByTestId('page-dots')).not.toBeInTheDocument()
  })

  test('an unmeasured container renders neither the swiper nor the split layout', async () => {
    // The Swiper caches the `itemWidth` it is first given; handing it a guess leaves
    // the page misaligned for good, so before measurement only the cover is drawn.
    const { queryByTestId } = await renderAt(0, 0, 'desktop')

    expect(queryByTestId('page-dots')).not.toBeInTheDocument()
    expect(elementTree.root!.querySelector('.full-player__stage-row')).toBeNull()
    expect(elementTree.root!.querySelector('.full-player__cover')).not.toBeNull()
  })
})

describe('resolved sizes reach the elements', () => {
  test.each([
    ['mobile', 390, 844],
    ['tablet', 700, TALL],
    ['desktop', 1200, TALL],
    ['tv', 2000, TALL],
  ])('%s: cover, play button and padding all match the table', async (bp, width, height) => {
    await renderAt(width, height, bp)
    const metrics = PLAYER_METRICS[bp as keyof typeof PLAYER_METRICS]

    const expectedCover = metrics.coverPx ?? Math.round(width * (metrics.coverRatio ?? 1))
    const cover = elementTree.root!.querySelector('.full-player__cover') as HTMLElement
    expect(cover.style.width, `${bp} cover width`).toBe(`${expectedCover}px`)
    expect(cover.style.height, `${bp} cover height`).toBe(`${expectedCover}px`)

    const play = elementTree.root!.querySelector('.player-controls__btn--primary') as HTMLElement
    expect(play.style.width, `${bp} play button`).toBe(`${metrics.playBtn}px`)
    expect(play.style.borderRadius, `${bp} play radius`).toBe(`${metrics.playRadius}px`)

    const page = elementTree.root!.querySelector('.full-player') as HTMLElement
    expect(page.style.paddingLeft, `${bp} padding`).toBe(`${metrics.padH}px`)
  })

  test('mobile uses a rounded rect and the wide classes use circles', async () => {
    // Flutter's `useRoundedRect` only applies to mobile's larger 76px button; the
    // desktop's 52px one stays circular. Radius vs. half-edge is the whole difference.
    await renderAt(390, 844, 'mobile')
    let play = elementTree.root!.querySelector('.player-controls__btn--primary') as HTMLElement
    expect(play.style.borderRadius).toBe('28px')
    expect(play.style.width).toBe('76px')

    await renderAt(1200, TALL, 'desktop')
    play = elementTree.root!.querySelector('.player-controls__btn--primary') as HTMLElement
    expect(play.style.borderRadius).toBe('26px') // 52 / 2 — a circle
    expect(play.style.width).toBe('52px')
  })

  test('a short stage shrinks the cover instead of overflowing it', async () => {
    // Phone in landscape, or a half-height desktop window. This is the case that was
    // wrong on a device: the cover asked for its table size, did not fit the stage, and
    // the frame overflowed upwards under the top bar.
    await renderAt(1200, 300, 'desktop')
    const cover = elementTree.root!.querySelector('.full-player__cover') as HTMLElement
    // 300 - chromeH(32) - margin(16) = 252, under the table's 300.
    expect(cover.style.height).toBe('252px')
  })

  test('the wide layout splits the stage 4:5 in the cover\'s favour', async () => {
    await renderAt(1200, TALL, 'desktop')
    const coverCol = elementTree.root!.querySelector('.full-player__cover-col') as HTMLElement
    const lyricsCol = elementTree.root!.querySelector('.full-player__lyrics-pane') as HTMLElement
    expect(coverCol.style.flexGrow).toBe('4')
    expect(lyricsCol.style.flexGrow).toBe('5')
  })
})

describe('the header states what the screen is only where there is room', () => {
  test('wide shows "Now Playing"', async () => {
    const { queryByText } = await renderAt(1200, TALL, 'desktop')
    expect(queryByText('Now Playing')).toBeInTheDocument()
    expect(queryByText('Mock Album')).not.toBeInTheDocument()
  })

  test('narrow shows the album instead', async () => {
    // The song title is directly under the cover there, so repeating it in the header
    // would waste the only line available.
    const { queryByText } = await renderAt(390, 844, 'mobile')
    expect(queryByText('Mock Album')).toBeInTheDocument()
    expect(queryByText('Now Playing')).not.toBeInTheDocument()
  })
})

/**
 * "Open straight to the lyrics" — working for the first time.
 *
 * The old code read the pref on mount and called `swipeTo(1)` in the `.then`. The
 * swiper only exists once a width is known, and the width was permanently 0 because
 * the page passed no `measureSelector`, so the ref was null and the call was dropped
 * every single time — no error, no warning. Fixing the measurement turned that into a
 * race (on Web the pref can resolve before the first layout), which is why the page
 * now waits for both the pref *and* the swiper.
 */
describe('auto-enter lyrics', () => {
  test('enters the lyrics screen once the swiper exists', async () => {
    autoEnterHook.mockResolvedValue(true)
    await renderAt(390, 844, 'mobile')
    await act(async () => {
      await Promise.resolve()
    })

    expect(swiperMock.swipeTo).toHaveBeenCalledWith(1)
  })

  test('does not fire while the preference is off', async () => {
    await renderAt(390, 844, 'mobile')
    await act(async () => {
      await Promise.resolve()
    })

    expect(swiperMock.swipeTo).not.toHaveBeenCalled()
  })

  test('does not fire on the wide layout, which has no second screen', async () => {
    autoEnterHook.mockResolvedValue(true)
    await renderAt(1200, TALL, 'desktop')
    await act(async () => {
      await Promise.resolve()
    })

    expect(swiperMock.swipeTo).not.toHaveBeenCalled()
  })

  test('does not fire before the container has been measured', async () => {
    // The swiper is not mounted yet, so this is the state the old code silently lost
    // the call in.
    autoEnterHook.mockResolvedValue(true)
    await renderAt(0, 0, 'mobile')
    await act(async () => {
      await Promise.resolve()
    })

    expect(swiperMock.swipeTo).not.toHaveBeenCalled()
  })
})

/**
 * The discriminating case: measurement arriving *after* the preference resolves.
 *
 * This is the actual shape of the old bug, and the one the three tests above cannot
 * see. They assert `swipeTo` is not called while unmeasured — which is true whether or
 * not the page waits, because the swiper is not mounted either way. What separates a
 * correct implementation from a broken one is what happens on the *next* frame: an
 * effect that fires immediately marks itself done, drops the call into a null ref, and
 * never retries, so the user lands on the cover. Waiting for the swiper retries and
 * lands on the lyrics.
 *
 * On Web this is the normal sequence, not an edge case: the width comes from a mount
 * effect, so the first frame always has none.
 */
test('auto-enter survives the width arriving after the preference', async () => {
  autoEnterHook.mockResolvedValue(true)

  // Frame 1: preference resolves, nothing measured yet, no swiper to talk to.
  const { rerender } = await renderAtRaw(0, 0, 'mobile')
  await act(async () => {
    await Promise.resolve()
  })
  expect(swiperMock.swipeTo).not.toHaveBeenCalled()

  // Frame 2: the measurement lands and the swiper mounts.
  breakpointHook.mockReturnValue({
    width: 390,
    height: 844,
    breakpoint: 'mobile',
    isWide: false,
    onLayoutChange: vi.fn(),
  })
  await act(async () => {
    rerender(<FullPlayerPage />)
    await Promise.resolve()
  })

  expect(swiperMock.swipeTo).toHaveBeenCalledWith(1)
})
