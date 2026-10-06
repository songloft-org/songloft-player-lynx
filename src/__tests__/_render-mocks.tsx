/**
 * Shared render-test mock factories.
 *
 * Two things in the login screen depend on runtime facilities that the ReactLynx
 * Vitest testing-library environment does not implement, and both crash the
 * shared snapshot tree if left real:
 *
 *  1. **lynx-ui native leaves** (`Input`, `Switch`). `Input`'s mount effect calls
 *     the native `NodesRef.invoke` (`setValue`) which the env stubs as
 *     `"not implemented"` → throws; `Switch` drives the native gesture runtime.
 *     Mocked here to plain `<view>/<text>` so the page's own structure is still
 *     exercised. The real components ship in build/dev/on-device (proven on
 *     device in batch 1) and `pnpm run build` still bundles them.
 *
 *  2. **the zustand auth store subscription** (`useAuthStore((s) => …)`). zustand
 *     subscribes through `useSyncExternalStore`, whose post-mount consistency
 *     pass forces a second synchronous commit while the initial dual-thread
 *     lifecycle events are still flushing. In the Vitest env that second
 *     `updateMainThread` patch reads `isListHolder` off a snapshot whose
 *     `__snapshot_def` is still `undefined` → the `Cannot read properties of
 *     undefined (reading 'isListHolder' / 'parentNode')` crash. On device the
 *     real runtime sequences these commits correctly. `makeAuthStoreMock`
 *     replaces only `useAuthStore` with a static, non-subscribing reader
 *     (`status: 'unknown'` by default; flip it with `setMockAuthStatus()`);
 *     every other store export is preserved via the caller's `vi.importActual`.
 *
 * Usage keeps the `vi.mock` calls in each test file (they must be hoisted) but
 * shares the factory bodies so the mock shapes cannot drift:
 *
 *   vi.mock('@lynx-js/lynx-ui-input', async () =>
 *     (await import('<path>/_render-mocks.js')).mockLynxUiInput())
 *   vi.mock('@lynx-js/lynx-ui-switch', async () =>
 *     (await import('<path>/_render-mocks.js')).mockLynxUiSwitch())
 *   vi.mock('<store path>', async () => {
 *     const actual = await vi.importActual('<store path>')
 *     return (await import('<path>/_render-mocks.js')).makeAuthStoreMock(actual)
 *   })
 */
import { createContext, forwardRef, useContext } from '@lynx-js/react'
import type { ReactNode } from '@lynx-js/react'
import { vi } from 'vitest'

import { setBackRouter } from '../core/navigation/route-back-action.js'
import { en } from '../i18n/resources.js'
import type { AuthState } from '../features/auth/store/index.js'
import type { Song } from '../models/song.js'
import type { PlayerState } from '../features/player/store/index.js'
import type { LyricState } from '../features/player/store/index.js'

// ── react-i18next render mock ────────────────────────────────────────────────
//
// `useTranslation()` subscribes to i18next language-change events (via
// useState/useEffect) — a subscription that, like the zustand ones, can perturb
// the ReactLynx Vitest snapshot tree. It also depends on a globally-initialised
// i18next instance. Mock it to a deterministic `t` backed by the REAL English
// resource tree, so render assertions still verify the actual shipped English
// copy (not a fixture echoed back). Interpolates `{{count}}` etc. from options.
// The real react-i18next + init are used in build/dev/on-device.

function lookupEn(key: string): string | undefined {
  const parts = key.split('.')
  let node: unknown = en
  for (const part of parts) {
    if (node && typeof node === 'object' && part in (node as Record<string, unknown>)) {
      node = (node as Record<string, unknown>)[part]
    } else {
      return undefined
    }
  }
  return typeof node === 'string' ? node : undefined
}

/** Resolve a key to its English value with `{{var}}` interpolation from options. */
export function translateEn(key: string, options?: Record<string, unknown>): string {
  const template = lookupEn(key)
  if (template === undefined) return key
  if (!options) return template
  return template.replace(/\{\{(\w+)\}\}/g, (_m, name: string) =>
    name in options ? String(options[name]) : `{{${name}}}`,
  )
}

/** Mock module for `react-i18next` — deterministic English `t`, no subscription. */
export function mockReactI18next() {
  const i18n = {
    language: 'en',
    changeLanguage: async () => {},
    on: () => {},
    off: () => {},
  }
  return {
    useTranslation: () => ({ t: translateEn, i18n, ready: true }),
    initReactI18next: { type: '3rdParty', init: () => {} },
    Trans: ({ children }: { children?: unknown }) => children as never,
  }
}

/** Mock module for `@lynx-js/lynx-ui-input` — `Input` as a plain view/text. */
export function mockLynxUiInput() {
  return {
    Input: ({
      className,
      placeholder,
    }: {
      className?: string
      placeholder?: string
    }) => (
      <view className={className}>
        <text>{placeholder}</text>
      </view>
    ),
  }
}

/**
 * Mock module for the global `ToastHost`.
 *
 * `ToastHost` subscribes to the zustand toast store (`useToastStore((s) => …)`),
 * and zustand subscribes through `useSyncExternalStore` — the same facility whose
 * post-mount consistency pass crashes the ReactLynx Vitest snapshot tree (see the
 * module header and `makeAuthStoreMock`). The host is mounted in the root route,
 * so every render test that goes through the router evaluates it; standing it in
 * with a no-op keeps those trees clean. Toast *behaviour* is covered by the store
 * unit test (`toast-store.test.ts`) and by asserting on `useToastStore.getState()`
 * in the page tests; the real host ships in build/dev/on-device.
 */
export function mockToastHost() {
  return {
    ToastHost: () => null,
  }
}

/**
 * Mock module for `@lynx-js/lynx-ui-switch` (a native gesture leaf, unmountable
 * in this env).
 *
 * It reproduces the one behaviour that matters for assertions: the real component
 * appends `ui-checked` / `ui-disabled` to **every** compound part's className
 * (Switch, SwitchTrack, SwitchThumb — each reads the state off a context), which
 * is the only channel through which switch state reaches CSS. The previous
 * passthrough dropped the `checked` prop entirely, so a rendered ON switch was
 * indistinguishable from an OFF one — and that blind spot is precisely how the
 * batch-19 "every switch looks the same" bug reached a device with tests green.
 *
 * The root view also carries `bindtap` (as the real one does via `usePressTap`),
 * so `fireEvent.tap` can drive `onChange` in tests.
 */
export function mockLynxUiSwitch() {
  interface SwitchState {
    checked: boolean
    disabled: boolean
  }
  const SwitchStateContext = createContext<SwitchState>({
    checked: false,
    disabled: false,
  })

  const withState = (className: string | undefined, s: SwitchState): string =>
    [className, s.checked ? 'ui-checked' : '', s.disabled ? 'ui-disabled' : '']
      .filter(Boolean)
      .join(' ')

  const Part = ({
    className,
    children,
  }: {
    className?: string
    children?: unknown
  }) => (
    <view className={withState(className, useContext(SwitchStateContext))}>
      {children as never}
    </view>
  )

  return {
    Switch: ({
      className,
      children,
      checked = false,
      disabled = false,
      onChange,
    }: {
      className?: string
      children?: unknown
      checked?: boolean
      disabled?: boolean
      onChange?: (next: boolean) => void
    }) => (
      <SwitchStateContext.Provider value={{ checked, disabled }}>
        <view
          className={withState(className, { checked, disabled })}
          bindtap={disabled ? undefined : () => onChange?.(!checked)}
        >
          {children as never}
        </view>
      </SwitchStateContext.Provider>
    ),
    SwitchTrack: Part,
    SwitchThumb: Part,
  }
}

/**
 * Mock module for `../widgets/VirtualList.js` — the native Lynx `<list>` wrapper.
 *
 * `<list>`/`<list-item>` virtualize their children, so the ReactLynx Vitest env
 * does not mount item content into the queryable tree (an on-device-only path).
 * This stand-in renders each item into a plain `<view>` so render tests can
 * assert the rows/cards actually produced. The real `<list>` ships in
 * build/dev/on-device. Generic over the item type via `unknown`.
 */
interface VirtualListStubProps {
  items?: readonly unknown[]
  itemKey: (item: unknown, index: number) => string
  renderItem: (item: unknown, index: number) => unknown
  footer?: unknown
  header?: unknown
  className?: string
}

export function mockVirtualList() {
  return {
    VirtualList: ({ items = [], itemKey, renderItem, footer, header, className }: VirtualListStubProps) => (
      <view className={className}>
        {header ? <view>{header as never}</view> : null}
        {items.map((item, index) => (
          <view key={itemKey(item, index)}>{renderItem(item, index) as never}</view>
        ))}
        {footer ? <view>{footer as never}</view> : null}
      </view>
    ),
  }
}

/**
 * Static auth state used by the mocked store. `status: 'unknown'` mirrors the
 * production store before `checkAuth()` runs — which since the splash gate
 * means the root view renders the splash, not a route (see
 * `RootRouteView`). Render tests that need an actual page on screen set the
 * status with `setMockAuthStatus()` before `render()`; the mock is a static
 * non-subscribing reader, so a change only affects subsequent renders.
 */
const authState: AuthState = {
  status: 'unknown',
  isLoading: false,
  error: undefined,
  hydrate: async () => {},
  checkAuth: async () => {},
  login: async () => {},
  logout: async () => {},
  expireSession: async () => {},
  reset: () => {},
}

/**
 * Point the mocked auth store at `status` — call it BEFORE `render()` (the
 * stand-in does not subscribe, so live changes never re-render). Pair with an
 * `afterEach` reset back to `'unknown'` when a file mixes scenarios.
 */
export function setMockAuthStatus(status: AuthState['status']): void {
  authState.status = status
}

/** Non-subscribing stand-in for the zustand `useAuthStore` hook + store api. */
function useAuthStoreMock<T>(selector?: (s: AuthState) => T): T | AuthState {
  return selector ? selector(authState) : authState
}
useAuthStoreMock.getState = (): AuthState => authState
useAuthStoreMock.setState = (): void => {}
useAuthStoreMock.subscribe = (): (() => void) => () => {}

/**
 * Merge a static `useAuthStore` over the real store module. Callers pass the
 * result of `vi.importActual(<store path>)` so `evaluateAuthGuard`, the
 * `PREF_*` keys, factories, etc. stay real.
 */
export function makeAuthStoreMock<M extends object>(actual: M): M {
  return { ...actual, useAuthStore: useAuthStoreMock } as unknown as M
}

// ── Player-feature render mocks ──────────────────────────────────────────────
//
// The player UI depends on three lynx-ui **native-gesture leaves** (Slider,
// Sheet, Swiper) and two **zustand subscriptions** (player store, lyric store),
// all of which crash the ReactLynx Vitest snapshot tree for the same reasons as
// the login screen's Input/Switch + auth store (see the module header). These
// factories stand them in with plain views / static readers so the player's
// real structure is still exercised; the real components + stores ship in
// build/dev/on-device.

const Pass = ({ className, children }: { className?: string; children?: unknown }) => (
  <view className={className}>{children as never}</view>
)

/** Mock `@lynx-js/lynx-ui-slider` — primitives as plain views. */
export function mockLynxUiSlider() {
  return {
    SliderRoot: Pass,
    SliderTrack: Pass,
    SliderIndicator: ({ className }: { className?: string }) => (
      <view className={className} />
    ),
    SliderThumb: Pass,
  }
}

/** Mock `@lynx-js/lynx-ui-sheet` — SheetRoot accepts a ref, renders children. */
export function mockLynxUiSheet() {
  const SheetRoot = forwardRef(function SheetRoot(
    { className, children }: { className?: string; children?: unknown },
    _ref: unknown,
  ) {
    return <view className={className}>{children as never}</view>
  })
  return {
    SheetRoot,
    SheetView: Pass,
    SheetBackdrop: ({ className }: { className?: string }) => (
      <view className={className} />
    ),
    SheetContent: Pass,
    SheetHandle: ({ className }: { className?: string }) => (
      <view className={className} />
    ),
    useSnap: () => ({}),
  }
}

/** Mock `@lynx-js/lynx-ui-swiper` — render each page via the child function. */
/**
 * Stand-in for the swiper, which forwards a ref exposing `swipeTo`.
 *
 * The ref is the point. The previous version ignored it, so `swiperRef.current` was
 * always null in tests and any `swipeTo` call vanished — which is exactly how "open
 * straight to the lyrics" managed to be broken from the day it shipped without a
 * single test noticing: on device the ref was null too (the swiper was never mounted,
 * because the page had no width), and the call was dropped just as silently.
 *
 * `swipeTo` records into `spy` so a test can assert the page asked for a screen; it
 * does not actually move anything, since there is nothing to scroll here.
 */
export function mockLynxUiSwiper() {
  const swipeTo = vi.fn()
  return {
    swipeTo,
    Swiper: forwardRef((
      {
        data,
        children,
      }: {
        data: unknown[]
        children: (p: { item: unknown; index: number }) => unknown
      },
      ref: unknown,
    ) => {
      const handle = { swipeTo }
      if (typeof ref === 'function') (ref as (r: unknown) => void)(handle)
      else if (ref && typeof ref === 'object') (ref as { current: unknown }).current = handle
      return (
        <view>
          {data.map((item, index) => (
            <view key={index}>{children({ item, index }) as never}</view>
          ))}
        </view>
      )
    }),
    SwiperItem: Pass,
  }
}

export function mockLynxUiSortable() {
  return {
    SortableRoot: ({
      data,
      children,
    }: {
      data: Array<{ getSortingKey: () => string; dataItem: unknown }>
      children: (item: { getSortingKey: () => string; dataItem: unknown }) => unknown
      onSortEnd?: (sorted: unknown[]) => void
      [key: string]: unknown
    }) => (
      <view>
        {data.map((item) => (
          <view key={item.getSortingKey()}>{children(item) as never}</view>
        ))}
      </view>
    ),
    SortableItem: Pass,
    SortableItemArea: Pass,
  }
}

/** A minimal `Song` for the mocked player state. */
export function mockSong(): Song {
  return {
    id: 1,
    type: 'local',
    title: 'Mock Song',
    artist: 'Mock Artist',
    album: 'Mock Album',
    year: 0,
    duration: 200,
    fileSize: 0,
    bitRate: 0,
    sampleRate: 0,
    isLive: false,
    isVideo: false,
    addedAt: '',
    updatedAt: '',
  } as Song
}

const noop = (): void => {}
const asyncNoop = async (): Promise<void> => {}

/** Read a real vanilla store without installing Node React render hooks. */
export function makeDlnaStoreMock<M extends { useDlnaStore: { getState: () => unknown } }>(actual: M): M {
  const store = actual.useDlnaStore
  const hook = Object.assign((select: (state: unknown) => unknown) => select(store.getState()), store)
  return { ...actual, useDlnaStore: hook } as M
}

/** Static, non-subscribing player state used by the mocked store. */
function mockPlayerState(over: Partial<PlayerState> = {}): PlayerState {
  return {
    currentSong: mockSong(),
    playlist: [mockSong()],
    currentIndex: 0,
    isPlaying: false,
    volume: 50,
    currentTime: 30_000,
    duration: 200_000,
    playMode: 'order',
    isBuffering: false,
    showFullPlayer: false,
    showPlaylistDrawer: false,
    showAudioTrackSheet: false,
    openAudioTrackSheet: noop,
    closeAudioTrackSheet: noop,
    sleepTimer: undefined,
    previousVolume: undefined,
    errorMessage: undefined,
    speed: 1,
    videoScaleMode: 'fit',
    playSong: asyncNoop,
    playPlaylist: asyncNoop,
    playAll: asyncNoop,
    togglePlay: asyncNoop,
    playNext: asyncNoop,
    playPrev: asyncNoop,
    seek: asyncNoop,
    seekBy: asyncNoop,
    setVolume: asyncNoop,
    toggleMute: asyncNoop,
    setPlayMode: noop,
    cyclePlayMode: noop,
    setSpeed: asyncNoop,
    addToPlaylist: noop,
    loadRemainingSongsForCurrentPlaylist: noop,
    insertNextInQueue: noop,
    removeFromPlaylist: asyncNoop,
    clearPlaylist: noop,
    toggleFullPlayer: noop,
    closeFullPlayer: noop,
    togglePlaylistDrawer: noop,
    closePlaylistDrawer: noop,
    clearError: noop,
    setSleepTimerByDuration: noop,
    setSleepTimerAfterSongs: noop,
    cancelSleepTimer: noop,
    setAudioTrack: asyncNoop,
    setVideoScaleMode: noop,
    // Answers the same value the real action does for "there was nothing to switch"
    // — the only outcome that needs no picture to exist.
    enterVideoSource: async () => 'skipped' as const,
    reset: noop,
    _onCompleted: noop,
    ...over,
  }
}

/** Non-subscribing stand-in for the `usePlayerStore` hook + store api. */
export function makePlayerStoreMock<M extends object>(
  actual: M,
  over: Partial<PlayerState> = {},
): M {
  const state = mockPlayerState(over)
  function usePlayerStore<T>(selector?: (s: PlayerState) => T): T | PlayerState {
    return selector ? selector(state) : state
  }
  usePlayerStore.getState = (): PlayerState => state
  usePlayerStore.setState = (): void => {}
  usePlayerStore.subscribe = (): (() => void) => () => {}
  return { ...actual, usePlayerStore } as unknown as M
}

function mockLyricState(over: Partial<LyricState> = {}): LyricState {
  return {
    lyrics: [
      { timeMs: 0, text: 'Mock line one' },
      { timeMs: 10_000, text: 'Mock line two' },
    ],
    currentIndex: 1,
    isLoading: false,
    loadFailed: false,
    synced: true,
    notificationLyricInTitle: false,
    translationMap: new Map(),
    romanizationMap: new Map(),
    hasTranslation: false,
    hasRomanization: false,
    rawLyric: null,
    loadForSong: asyncNoop,
    refetch: asyncNoop,
    setLyricsFromText: noop,
    setRawLyric: noop,
    syncPosition: noop,
    setNotificationLyricInTitle: noop,
    clear: noop,
    ...over,
  }
}

/**
 * lynx-ui Dialog stand-in.
 *
 * Keeps `DialogRoot` rendering its children in the hidden state rather than
 * unmounting them, and reports visibility as `data-dialoghidden` — the shape the
 * three settings/plugin/duplicate page tests already hand-roll, because unmounting
 * would hide the regression they pin (a dialog whose subject is cleared while it is
 * still on screen). Extracted so new tests do not invent a fifth shape.
 */
export function mockLynxUiDialog() {
  const Pass = ({ children }: { children: ReactNode }) => <view>{children}</view>
  return {
    DialogRoot: ({ children, show }: { children: ReactNode; show: boolean }) => (
      <view data-testid='stub-dialogroot' data-dialoghidden={show ? 'false' : 'true'}>
        {children}
      </view>
    ),
    DialogView: Pass,
    DialogBackdrop: Pass,
    DialogContent: Pass,
    DialogClose: Pass,
  }
}

/**
 * Point the shared back-navigation policy at a fake router sitting on `pathname`.
 *
 * Back arrows no longer call `useNavigate()` — they go through `performRouteBack()`,
 * which reads the route's declared parent from `shared/nav/route-back.ts` and drives
 * the injected router. So a page test asserting *where* back goes has to inject one;
 * mocking `useNavigate` alone now observes nothing.
 *
 * Deliberately injects a fake router rather than stubbing `performRouteBack`: these
 * assertions are worth keeping at full strength, and going through the real policy
 * is what makes them fail if a route's parent is wrong.
 *
 * Returns the `navigate` spy. Call `resetBackRouterForTests()` in `afterEach` when a
 * file installs more than one.
 */
export function installBackRouter(pathname: string): ReturnType<typeof vi.fn> {
  const navigate = vi.fn()
  setBackRouter({ state: { location: { pathname } }, navigate } as never)
  return navigate
}

/**
 * Stand-in for the favorites module, whose hooks are react-query based.
 *
 * `useFavoriteToggle` calls `useQuery`/`useMutation`, so any tree containing the
 * player's favorite button throws `No QueryClient set` unless the test wraps it in a
 * `QueryClientProvider` — and the render tests here mount components directly.
 *
 * A factory rather than a per-file object literal: four files need it, and the shape
 * has to match `favorites.ts`. A mock that quietly returns a different shape is worse
 * than no mock, because the component keeps rendering and the assertion still passes.
 *
 * `toggle` is the returned spy, so a test can assert the tap reached it.
 */
export function mockFavorites(over: { isFavorite?: boolean } = {}) {
  const toggle = vi.fn()
  const isFavorite = over.isFavorite ?? false
  return {
    toggle,
    module: {
      useIsFavorite: () => isFavorite,
      useFavoriteToggle: () => ({ isFavorite, toggle, isPending: false }),
      // Non-React paths the player store imports at module scope. Left as inert
      // resolved promises: the store wires them to native remote-command events,
      // which no render test dispatches.
      getFavoriteState: async () => isFavorite,
      toggleFavoriteNonReact: async () => {},
    },
  }
}

/** Non-subscribing stand-in for the `useLyricStore` hook + store api. */
export function makeLyricStoreMock<M extends object>(
  actual: M,
  over: Partial<LyricState> = {},
): M {
  const state = mockLyricState(over)
  function useLyricStore<T>(selector?: (s: LyricState) => T): T | LyricState {
    return selector ? selector(state) : state
  }
  useLyricStore.getState = (): LyricState => state
  useLyricStore.setState = (): void => {}
  useLyricStore.subscribe = (): (() => void) => () => {}
  return { ...actual, useLyricStore } as unknown as M
}
