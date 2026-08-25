import '../../../shims/router-env.js'

import { beforeEach, describe, expect, test, vi } from 'vitest'
import { getQueriesForElement, render } from '@lynx-js/react/testing-library'

import type { PluginTabEntry } from '../../../features/jsplugin/data/tab-config.js'

/**
 * The wide rail's iPadOS-style grouping: main destinations straight down, plugin
 * tabs under a 插件 header (absent when there are none), Settings in the foot
 * group behind a gap. `useBreakpoint` is mocked wide so the shell renders the
 * rail branch — the narrow branch's fold is covered by `shell-fold.test.tsx`.
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
  useNavigate: () => vi.fn(),
  useRouterState: ({ select }: { select: (s: unknown) => unknown }) =>
    select({ location: { pathname: '/' } }),
}))

// Wide layout: the shell renders the rail, never the bottom bar / More sheet.
vi.mock('../../responsive/useBreakpoint.js', () => ({
  useBreakpoint: () => ({
    width: 1024,
    breakpoint: 'wide',
    isWide: true,
    onLayoutChange: () => {},
  }),
}))

const { ShellLayout } = await import('../ShellLayout.js')

function tab(entryPath: string, name = entryPath): PluginTabEntry {
  return { pluginId: 1, entryPath, name }
}

function renderShell() {
  const result = render(<ShellLayout />)
  return getQueriesForElement(result.container as unknown as HTMLElement)
}

beforeEach(() => {
  vi.clearAllMocks()
  shellTabs.data = undefined
})

describe('the wide rail groups destinations iPadOS-style', () => {
  test('no plugins: main items straight down, no plugin header, no gap', () => {
    shellTabs.data = { showLibrary: true, pluginTabs: [] }
    const q = renderShell()

    expect(q.getByTestId('nav-item-home')).toBeTruthy()
    expect(q.getByTestId('nav-item-library')).toBeTruthy()
    expect(q.getByTestId('nav-item-settings')).toBeTruthy()
    expect(q.queryByTestId('rail-plugins-header')).toBeNull()
    expect(q.queryByTestId('rail-settings-gap')).toBeNull()
  })

  test('plugins land under the 插件 header, Settings behind the gap', () => {
    shellTabs.data = { showLibrary: true, pluginTabs: [tab('miot'), tab('weather')] }
    const q = renderShell()

    expect(q.getByTestId('rail-plugins-header')).toBeTruthy()
    expect(q.getByTestId('nav-item-miot')).toBeTruthy()
    expect(q.getByTestId('nav-item-weather')).toBeTruthy()
    expect(q.getByTestId('nav-item-settings')).toBeTruthy()
    expect(q.getByTestId('rail-settings-gap')).toBeTruthy()
  })

  test('the rail never folds: every destination is visible however many', () => {
    shellTabs.data = {
      showLibrary: true,
      pluginTabs: [tab('miot'), tab('a'), tab('b'), tab('c')],
    }
    const q = renderShell()

    // Six destinations would fold the narrow bar into 4 + More; the rail keeps
    // all of them and has no More slot.
    expect(q.getByTestId('nav-item-home')).toBeTruthy()
    expect(q.getByTestId('nav-item-library')).toBeTruthy()
    expect(q.getByTestId('nav-item-miot')).toBeTruthy()
    expect(q.getByTestId('nav-item-a')).toBeTruthy()
    expect(q.getByTestId('nav-item-b')).toBeTruthy()
    expect(q.getByTestId('nav-item-c')).toBeTruthy()
    expect(q.getByTestId('nav-item-settings')).toBeTruthy()
    expect(q.queryByTestId('nav-item-more')).toBeNull()
    expect(q.queryByTestId('more-tabs-sheet')).toBeNull()
  })
})
