import '../../../shims/router-env.js'

import { beforeEach, describe, expect, test, vi } from 'vitest'
import { act, fireEvent, getQueriesForElement, render } from '@lynx-js/react/testing-library'

import type { PluginTabEntry } from '../../../features/jsplugin/data/tab-config.js'

/**
 * The shell's narrow-bar fold: with at most five destinations the bar shows
 * every tab; past that it keeps the first four plus a "More" slot that opens
 * the overflow sheet. `useBreakpoint` reports width 0 here (no layout events),
 * so the shell always renders the narrow branch in this env — exactly the
 * branch the fold lives on.
 */

// The tab-config query — mocked to a static shape the tests vary per case.
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
  useNavigate: () => navigate,
  useRouterState: ({ select }: { select: (s: unknown) => unknown }) =>
    select({ location: { pathname: '/' } }),
}))

const navigate = vi.fn()

const { ShellLayout } = await import('../ShellLayout.js')
const { clearBackHandlersForTests, dispatchBack } = await import('../../nav/back-stack.js')

function tab(entryPath: string, name = entryPath): PluginTabEntry {
  return { pluginId: 1, entryPath, name }
}

function renderShell() {
  const result = render(<ShellLayout />)
  return getQueriesForElement(result.container as unknown as HTMLElement)
}

beforeEach(() => {
  vi.clearAllMocks()
  clearBackHandlersForTests()
  shellTabs.data = undefined
})

describe('the narrow bar without overflow', () => {
  test('three tabs (config loading): the classic bar, no More slot', () => {
    const q = renderShell()
    expect(q.getByTestId('nav-item-home')).toBeTruthy()
    expect(q.getByTestId('nav-item-library')).toBeTruthy()
    expect(q.getByTestId('nav-item-settings')).toBeTruthy()
    expect(q.queryByTestId('nav-item-more')).toBeNull()
    expect(q.queryByTestId('more-tabs-sheet')).toBeNull()
  })

  test('exactly five tabs still fit without folding', () => {
    shellTabs.data = { showLibrary: true, pluginTabs: [tab('miot'), tab('weather')] }
    const q = renderShell()
    expect(q.getByTestId('nav-item-home')).toBeTruthy()
    expect(q.getByTestId('nav-item-library')).toBeTruthy()
    expect(q.getByTestId('nav-item-miot')).toBeTruthy()
    expect(q.getByTestId('nav-item-weather')).toBeTruthy()
    expect(q.getByTestId('nav-item-settings')).toBeTruthy()
    expect(q.queryByTestId('nav-item-more')).toBeNull()
  })

  test('showLibrary=false removes the library tab', () => {
    shellTabs.data = { showLibrary: false, pluginTabs: [] }
    const q = renderShell()
    expect(q.queryByTestId('nav-item-library')).toBeNull()
    expect(q.getByTestId('nav-item-settings')).toBeTruthy()
  })
})

describe('the narrow bar with overflow folds into 4 + More', () => {
  beforeEach(() => {
    // Six destinations: home, library, three plugins, settings.
    shellTabs.data = { showLibrary: true, pluginTabs: [tab('miot'), tab('a'), tab('b')] }
  })

  test('the bar keeps the first four destinations and a More slot', () => {
    const q = renderShell()
    expect(q.getByTestId('nav-item-home')).toBeTruthy()
    expect(q.getByTestId('nav-item-library')).toBeTruthy()
    expect(q.getByTestId('nav-item-miot')).toBeTruthy()
    expect(q.getByTestId('nav-item-a')).toBeTruthy()
    // b and settings live in the sheet, not the bar.
    expect(q.queryByTestId('nav-item-b')).toBeNull()
    expect(q.queryByTestId('nav-item-settings')).toBeNull()
    expect(q.getByTestId('nav-item-more')).toBeTruthy()
  })

  test('tapping More opens the sheet with the overflowed tabs', () => {
    const q = renderShell()
    expect(q.queryByTestId('more-tabs-sheet')).toBeNull()
    fireEvent.tap(q.getByTestId('nav-item-more'), {})
    expect(q.getByTestId('more-tabs-sheet')).toBeTruthy()
    expect(q.getByTestId('more-tabs-item-b')).toBeTruthy()
    expect(q.getByTestId('more-tabs-item-settings')).toBeTruthy()
    expect(q.queryByTestId('more-tabs-item-miot')).toBeNull()
  })

  test('the sheet closes on a backdrop tap', () => {
    const q = renderShell()
    fireEvent.tap(q.getByTestId('nav-item-more'), {})
    fireEvent.tap(q.getByTestId('more-tabs-backdrop'), {})
    expect(q.queryByTestId('more-tabs-sheet')).toBeNull()
  })

  /*
   * Layering note (no assertion — pinned in native-module-contract instead):
   * the plugin iframe mounts INSIDE lynx-view's shadow root on Web, so the
   * sheet (z-index 100) simply out-z-indexes the frame (z-index 50); no hide/
   * show wiring lives in the shell anymore.
   */

  test('back closes the open sheet', async () => {
    const q = renderShell()
    fireEvent.tap(q.getByTestId('nav-item-more'), {})
    await act(async () => {
      expect(dispatchBack()).toBe(true)
    })
    expect(q.queryByTestId('more-tabs-sheet')).toBeNull()
  })

  test('selecting an overflowed tab navigates and closes the sheet', () => {
    const q = renderShell()
    fireEvent.tap(q.getByTestId('nav-item-more'), {})
    fireEvent.tap(q.getByTestId('more-tabs-item-b'), {})
    expect(navigate).toHaveBeenCalledWith({
      to: '/plugin/$entryPath',
      params: { entryPath: 'b' },
      search: { tab: true },
    })
    expect(q.queryByTestId('more-tabs-sheet')).toBeNull()
  })

  test('a bar tab still navigates directly', () => {
    const q = renderShell()
    fireEvent.tap(q.getByTestId('nav-item-miot'), {})
    expect(navigate).toHaveBeenCalledWith({
      to: '/plugin/$entryPath',
      params: { entryPath: 'miot' },
      search: { tab: true },
    })
  })
})
