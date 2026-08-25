import '../../../shims/router-env.js'

import { beforeEach, describe, expect, test, vi } from 'vitest'
import { fireEvent, getQueriesForElement, render } from '@lynx-js/react/testing-library'

import type { PluginTabEntry } from '../../../features/jsplugin/data/tab-config.js'
import { buildNavDestinations, NAV_REAL_SLOTS } from '../destinations.js'

/**
 * `MoreTabsSheet` render + interaction. The destinations arrive as props (the
 * shell slices them), so the only mocks needed are the ones that keep the tree
 * free of native leaves / live query clients: the plugin icon (its own query
 * hook), react-i18next, and the library barrel the sheet's select handler reads.
 */

const navigate = vi.fn()
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigate,
}))

vi.mock('../../../features/jsplugin/index.js', () => ({
  PluginTabIcon: () => null,
}))

vi.mock('../../../features/library/index.js', () => ({
  getLastLibrarySearch: () => ({ view: 'songs' }),
}))

vi.mock('react-i18next', async () =>
  (await import('../../../__tests__/_render-mocks.js')).mockReactI18next(),
)

vi.mock('../ui/Icon.js', () => ({
  Icon: () => null,
  ICON_COLORS: { primary: '#111', primaryContent: '#fff', contentMuted: '#888' },
}))

const { MoreTabsSheet } = await import('../MoreTabsSheet.js')
const { clearBackHandlersForTests, dispatchBack } = await import('../back-stack.js')

function tab(entryPath: string, name = entryPath): PluginTabEntry {
  return { pluginId: 1, entryPath, name }
}

/** Six destinations (home, library, three plugins, settings): the sheet holds the last two. */
const OVERFLOWED = buildNavDestinations(true, [tab('miot', 'MIoT'), tab('a'), tab('b')])
  .slice(NAV_REAL_SLOTS)

function renderSheet(over: { show?: boolean; items?: typeof OVERFLOWED; activePath?: string } = {}) {
  const onShowChange = vi.fn()
  const result = render(
    <MoreTabsSheet
      items={over.items ?? OVERFLOWED}
      activePath={over.activePath}
      show={over.show ?? true}
      onShowChange={onShowChange}
    />,
  )
  const q = getQueriesForElement(result.container as unknown as HTMLElement)
  const text = () => (result.container as unknown as { textContent: string }).textContent ?? ''
  return { onShowChange, q, text }
}

beforeEach(() => {
  vi.clearAllMocks()
  clearBackHandlersForTests()
})

describe('MoreTabsSheet rendering', () => {
  test('shows nothing while closed', () => {
    const { q } = renderSheet({ show: false })
    expect(q.queryByTestId('more-tabs-sheet')).toBeNull()
  })

  test('lists the overflowed destinations in order', () => {
    const { q, text } = renderSheet()
    // Plugin names render literally; the built-in goes through t(...).
    expect(text()).toContain('b')
    expect(text()).toContain('More')
    expect(q.getByTestId('more-tabs-item-b')).toBeTruthy()
    expect(q.getByTestId('more-tabs-item-settings')).toBeTruthy()
    // Order: the slice preserved it — b before settings in the DOM text.
    expect(text().indexOf('b')).toBeLessThan(text().indexOf('Settings'))
  })

  test('the active overflowed tab is highlighted', () => {
    const { q } = renderSheet({ activePath: '/plugin/b' })
    expect(q.getByTestId('more-tabs-item-b').className).toContain('more-tabs__item--active')
    expect(q.getByTestId('more-tabs-item-settings').className)
      .not.toContain('more-tabs__item--active')
  })
})

describe('MoreTabsSheet actions', () => {
  test('selecting a plugin tab closes the sheet and navigates to its route', () => {
    const { q, onShowChange } = renderSheet()
    fireEvent.tap(q.getByTestId('more-tabs-item-b'), {})
    expect(onShowChange).toHaveBeenCalledWith(false)
    expect(navigate).toHaveBeenCalledWith({
      to: '/plugin/$entryPath',
      params: { entryPath: 'b' },
      // Tab entries navigate with `tab: true` — the plugin opens chromeless.
      search: { tab: true },
    })
  })

  test('selecting settings navigates there too', () => {
    const { q } = renderSheet()
    fireEvent.tap(q.getByTestId('more-tabs-item-settings'), {})
    expect(navigate).toHaveBeenCalledWith({ to: '/settings' })
  })

  test('tapping the backdrop closes without navigating', () => {
    const { q, onShowChange } = renderSheet()
    fireEvent.tap(q.getByTestId('more-tabs-backdrop'), {})
    expect(onShowChange).toHaveBeenCalledWith(false)
    expect(navigate).not.toHaveBeenCalled()
  })

  test('back closes the sheet while it is open', () => {
    renderSheet()
    expect(dispatchBack()).toBe(true)
  })

  test('back does not touch the sheet while it is closed', () => {
    renderSheet({ show: false })
    expect(dispatchBack()).toBe(false)
  })

  test('tapping inside the panel does not close it', () => {
    const { q, onShowChange } = renderSheet()
    fireEvent.tap(q.getByTestId('more-tabs-item-b'), {})
    // select() DID close — but only via the callback, never via the backdrop
    // path. A tap on a non-navigating element (the title) must close nothing.
    onShowChange.mockClear()
    fireEvent.tap(q.getByText('More'), {})
    expect(onShowChange).not.toHaveBeenCalled()
  })
})
