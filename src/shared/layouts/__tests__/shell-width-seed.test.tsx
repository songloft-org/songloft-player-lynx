import '../../../shims/router-env.js'

import { beforeEach, describe, expect, test, vi } from 'vitest'
import { getQueriesForElement, render } from '@lynx-js/react/testing-library'

import type { PluginTabEntry } from '../../../features/jsplugin/data/tab-config.js'

/**
 * The anti-flash seed for the shell itself (songloft-player-lynx#6).
 *
 * `/player` is a chrome-less route outside `shellRoute`, so opening the
 * full-screen player unmounts `ShellLayout` and closing it remounts the shell.
 * On remount, `useBreakpoint(0, '.shell')` used to start at width 0 → `mobile`
 * → the first frame painted a narrow bottom bar; only after the async
 * `boundingClientRect` measurement landed did it switch to the wide side rail
 * — the "left sidebar appears late" flash.
 *
 * The fix: seed `useBreakpoint` from the module-level `shellWidth` cache that
 * `ShellLayout` itself publishes on every render (and that survives the
 * player round-trip). This test pins that the cache reaches the hook's initial
 * width and thus the first frame is already wide.
 *
 * The real `useBreakpoint` is used (not mocked): in this env there is no `lynx`
 * host global, so its async measurement is a no-op and it stays at the seed —
 * exactly the frame-1 state we want to assert. Before the fix, `ShellLayout`
 * passed `0` to the hook regardless of the cache, so this test failed
 * (reverse-verified: the wide assertion went red).
 */

const shellTabs: { data?: { showLibrary: boolean, pluginTabs: PluginTabEntry[] } } = {}
vi.mock('../../../features/jsplugin/index.js', () => ({
  useShellNavTabs: () => shellTabs,
  PluginTabIcon: ({ tab }: { tab: PluginTabEntry }) => tab.name,
}))

// No song loaded → no mini player; the player barrel pulls native leaves.
vi.mock('../../../features/player/widgets/MiniPlayer.js', () => ({
  MiniPlayer: () => null,
}))

// The shell reads the store for the `shell--with-mini` inset tier; the real
// store pulls native audio leaves, so serve the selector a song-less state.
vi.mock('../../../features/player/store/index.js', () => ({
  usePlayerStore: (selector: (s: { currentSong: null }) => unknown) =>
    selector({ currentSong: null }),
}))

vi.mock('react-i18next', async () =>
  (await import('../../../__tests__/_render-mocks.js')).mockReactI18next(),
)

vi.mock('@tanstack/react-router', () => ({
  Outlet: () => <view data-testid='shell-outlet' />,
  useNavigate: () => vi.fn(),
  useRouterState: ({ select }: { select: (s: unknown) => unknown }) =>
    select({ location: { pathname: '/' } }),
}))

const { ShellLayout } = await import('../ShellLayout.js')
const { setShellWidth } = await import('../../nav/shell-navigation.js')

function renderShell() {
  const result = render(<ShellLayout />)
  return getQueriesForElement(result.container as unknown as HTMLElement)
}

beforeEach(() => {
  vi.clearAllMocks()
  shellTabs.data = { showLibrary: true, pluginTabs: [] }
})

describe('the shell seeds its breakpoint from the cached width', () => {
  test('a cached wide width paints the wide rail on frame 1, not a narrow bottom bar', () => {
    // Simulate "returning from /player": the shell had measured 1280 before
    // unmounting, so the cache holds 1280. The remount must seed from it.
    setShellWidth(1280)
    const root = renderShell().getByTestId('shell-root')

    // Frame 1 is already wide — no flash through a narrow bottom bar.
    expect(root.className).toContain('shell--wide')
    expect(root.getAttribute('data-breakpoint')).toBe('desktop')
    expect(root.querySelector('.shell__rail')).not.toBeNull()
    expect(root.querySelector('.shell__bottombar')).toBeNull()
  })
})
