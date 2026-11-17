import '../../../shims/router-env.js'
import { useEffect, useState } from '@lynx-js/react'
import {
  act,
  fireEvent,
  getQueriesForElement,
  render,
} from '@lynx-js/react/testing-library'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

const h = vi.hoisted(() => ({
  location: { pathname: '/plugin/bili', search: { tab: true } },
  web: false,
  plugins: [
    {
      id: 1,
      entryPath: 'bili',
      version: '1',
      isActive: true,
      renderEngine: 'lynx',
    },
  ],
  mounted: 0,
  disposed: 0,
}))
vi.mock('@tanstack/react-router', () => ({
  useRouterState: ({ select }: { select: (s: unknown) => unknown }) =>
    select({ location: h.location }),
}))
vi.mock('../../../native/web-platform.js', () => ({
  isWebPlatform: () => h.web,
}))
vi.mock('../data/jsplugin-query.js', () => ({
  usePluginsQuery: () => ({ data: { plugins: h.plugins } }),
}))
vi.mock('../widgets/LynxPluginFrame.js', () => ({
  LynxPluginFrame: function Frame({
    entryPath,
    active,
    isTabEntry,
  }: {
    entryPath: string
    active: boolean
    isTabEntry: boolean
  }) {
    const [query, setQuery] = useState('')
    useEffect(() => {
      h.mounted++
      return () => {
        h.disposed++
      }
    }, [])
    return (
      <view
        data-testid={`frame-${entryPath}`}
        data-active={String(active)}
        data-embed={String(isTabEntry)}
      >
        <text>{query}</text>
        <view
          data-testid="search"
          bindtap={() => setQuery('saved search and results')}
        >
          search
        </view>
      </view>
    )
  },
}))
const { RetainedPluginTabs } = await import('../widgets/RetainedPluginTabs.js')
let result: ReturnType<typeof render>
const queries = () => getQueriesForElement(result.container)
beforeEach(() => {
  h.location = { pathname: '/plugin/bili', search: { tab: true } }
  h.web = false
  h.mounted = 0
  h.disposed = 0
  h.plugins = [
    {
      id: 1,
      entryPath: 'bili',
      version: '1',
      isActive: true,
      renderEngine: 'lynx',
    },
  ]
})
afterEach(() => result?.unmount())
function page() {
  return (
    <RetainedPluginTabs>
      <view data-testid="outlet" />
    </RetainedPluginTabs>
  )
}
async function go(pathname: string) {
  await act(async () => {
    h.location = { pathname, search: { tab: true } }
    result.rerender(page())
    await Promise.resolve()
  })
}
test('library round-trip retains the exact native frame and its search state', async () => {
  result = render(page())
  const original = queries().getByTestId('frame-bili')
  await act(async () => {
    fireEvent.tap(queries().getByTestId('search'))
  })
  await go('/library')
  expect(queries().getByTestId('frame-bili')).toBe(original)
  expect(queries().getByTestId('frame-bili').getAttribute('data-active')).toBe(
    'false',
  )
  expect(h.disposed).toBe(0)
  await go('/plugin/bili')
  expect(queries().getByTestId('frame-bili')).toBe(original)
  expect(original.textContent).toContain('saved search and results')
  expect(h.mounted).toBe(1)
})
test('plugin update or disable disposes the old frame', async () => {
  result = render(page())
  const original = queries().getByTestId('frame-bili')
  h.plugins = [{ ...h.plugins[0]!, version: '2' }]
  await go('/plugin/bili')
  expect(queries().getByTestId('frame-bili')).not.toBe(original)
  expect(h.disposed).toBe(1)
  h.plugins = []
  await go('/library')
  expect(queries().queryByTestId('frame-bili')).toBeNull()
  expect(h.disposed).toBe(2)
})
test('home grid round-trips retain one native frame and preserve pushed presentation', async () => {
  h.location.search.tab = false
  result = render(page())
  const original = queries().getByTestId('frame-bili')
  await act(async () => {
    fireEvent.tap(queries().getByTestId('search'))
  })
  for (let visit = 0; visit < 20; visit++) {
    await go('/')
    expect(original.getAttribute('data-active')).toBe('false')
    await act(async () => {
      h.location = { pathname: '/plugin/bili', search: { tab: false } }
      result.rerender(page())
    })
    expect(queries().getByTestId('frame-bili')).toBe(original)
    expect(original.textContent).toContain('saved search and results')
  }
  expect(h.mounted).toBe(1)
  expect(h.disposed).toBe(0)
})
test('home and tab entries share a frame; unrelated pages preserve its last presentation', async () => {
  h.location.search.tab = false
  result = render(page())
  const original = queries().getByTestId('frame-bili')
  expect(original.getAttribute('data-embed')).toBe('false')
  await go('/plugin/bili')
  expect(queries().getByTestId('frame-bili')).toBe(original)
  expect(original.getAttribute('data-embed')).toBe('true')
  await go('/')
  expect(original.getAttribute('data-embed')).toBe('true')
  expect(h.mounted).toBe(1)
})
test('Web keeps its existing rendering path', () => {
  h.web = true
  h.location.search.tab = true
  result = render(page())
  expect(queries().queryByTestId('outlet')).not.toBeNull()
  expect(queries().queryByTestId('frame-bili')).toBeNull()
})
