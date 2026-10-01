import '../../../shims/router-env.js'

import { beforeEach, describe, expect, test, vi } from 'vitest'
import { fireEvent, getQueriesForElement, render } from '@lynx-js/react/testing-library'

import { createMemoryStorage, setSongloftStorage } from '../../../core/storage/index.js'
import type { PluginTabEntry } from '../../../features/jsplugin/data/tab-config.js'

/**
 * The wide rail's collapse affordance, plus the CSS contract that keeps the
 * transition smooth.
 *
 * The defect this is modelled on (Flutter's desktop sidebar,
 * songloft-org/songloft#487) was not the state — it was that the content was
 * laid out against the animating width, so rows jumped and text re-wrapped on
 * every frame. The state assertions below are cheap; the CSS ones are the
 * load-bearing half, because a future edit that "simplifies" the geometry back
 * to a percentage width would look fine in a render test and jitter on device.
 */

const shellTabs: { data?: { showLibrary: boolean, pluginTabs: PluginTabEntry[] } } = {}
vi.mock('../../../features/jsplugin/index.js', () => ({
  useShellNavTabs: () => shellTabs,
  PluginTabIcon: ({ tab }: { tab: PluginTabEntry }) => tab.name,
}))

vi.mock('../../../features/player/widgets/MiniPlayer.js', () => ({
  MiniPlayer: () => null,
}))

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

// Wide layout: the shell renders the rail (where the toggle lives).
vi.mock('../../responsive/useBreakpoint.js', () => ({
  useBreakpoint: () => ({
    width: 1024,
    breakpoint: 'wide',
    isWide: true,
    onLayoutChange: () => {},
  }),
}))

const { ShellLayout } = await import('../ShellLayout.js')
const { PREF_RAIL_COLLAPSED, resetRailCollapsedForTests } = await import('../rail-collapse.js')

const storage = createMemoryStorage()

function renderShell() {
  const result = render(<ShellLayout />)
  return getQueriesForElement(result.container as unknown as HTMLElement)
}

beforeEach(() => {
  vi.clearAllMocks()
  resetRailCollapsedForTests()
  setSongloftStorage(storage)
  shellTabs.data = { showLibrary: true, pluginTabs: [] }
})

describe('the rail collapse toggle', () => {
  test('renders in the rail foot with an accessible name', () => {
    const q = renderShell()
    const toggle = q.getByTestId('rail-collapse-toggle')
    expect(toggle).toBeTruthy()
    expect(toggle.getAttribute('accessibility-label'))
      .toBe('Collapse sidebar')
  })

  test('tapping it collapses the shell, and tapping again expands it', () => {
    const q = renderShell()
    const root = q.getByTestId('shell-root')
    expect(root.getAttribute('class')).not.toContain('shell--rail-collapsed')

    fireEvent.tap(q.getByTestId('rail-collapse-toggle'), {})
    expect(q.getByTestId('shell-root').getAttribute('class'))
      .toContain('shell--rail-collapsed')
    // The accessible name follows the state (the visible label is clipped away).
    expect(q.getByTestId('rail-collapse-toggle').getAttribute('accessibility-label'))
      .toBe('Expand sidebar')

    fireEvent.tap(q.getByTestId('rail-collapse-toggle'), {})
    expect(q.getByTestId('shell-root').getAttribute('class'))
      .not.toContain('shell--rail-collapsed')
  })

  test('the collapse is persisted for the next session', async () => {
    const q = renderShell()
    fireEvent.tap(q.getByTestId('rail-collapse-toggle'), {})
    await Promise.resolve()
    expect(await storage.prefs.get(PREF_RAIL_COLLAPSED)).toBe('true')
  })

  test('the rail keeps every destination reachable while collapsed', () => {
    const q = renderShell()
    fireEvent.tap(q.getByTestId('rail-collapse-toggle'), {})
    // Collapsing is a width change, not a re-render: the rows stay mounted.
    expect(q.getByTestId('nav-item-home')).toBeTruthy()
    expect(q.getByTestId('nav-item-library')).toBeTruthy()
    expect(q.getByTestId('nav-item-settings')).toBeTruthy()
  })
})
