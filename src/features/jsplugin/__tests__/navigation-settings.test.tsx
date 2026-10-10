import '../../../shims/router-env.js'
import '@testing-library/jest-dom'
import type { ReactNode } from '@lynx-js/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  act,
  fireEvent,
  getQueriesForElement,
  render,
  renderHook,
  waitFor,
} from '@lynx-js/react/testing-library'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import type { JSPlugin } from '../../../models/jsplugin.js'
import type { TabConfig } from '../data/tab-config.js'
import { appConfig } from '../../../core/config/app-config.js'
import { useAppSessionStore } from '../../../store/app-session.js'

const h = vi.hoisted(() => ({
  read: vi.fn<() => Promise<TabConfig>>(),
  plugins: vi.fn<() => Promise<{ plugins: JSPlugin[] }>>(),
  write: vi.fn<(config: TabConfig) => Promise<TabConfig>>(),
  update: vi.fn(async () => ({})),
  updateAll: vi.fn(async () => ({})),
  navigate: vi.fn(),
}))

vi.mock('../../settings/api/index.js', () => ({
  getSettingsApi: () => ({ getTabConfig: h.read, updateTabConfig: h.write }),
}))
vi.mock('../api/index.js', () => ({
  getJSPluginApi: () => ({
    getPlugins: h.plugins,
    updatePlugin: h.update,
    updateAllPlugins: h.updateAll,
  }),
}))
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => h.navigate }))
vi.mock('react-i18next', async () =>
  (await import('../../../__tests__/_render-mocks.js')).mockReactI18next(),
)
vi.mock('@lynx-js/lynx-ui-switch', async () =>
  (await import('../../../__tests__/_render-mocks.js')).mockLynxUiSwitch(),
)
vi.mock('@lynx-js/lynx-ui-sortable', async () =>
  (await import('../../../__tests__/_render-mocks.js')).mockLynxUiSortable(),
)

const { navigationTabCount, reorderActivePluginTabs, useNavigationSettings } = await import(
  '../data/navigation-settings.js'
)
const { PluginNavigationToggle, PluginNavigationOrder, BuiltInNavigationSettings, NavigationSummary } = await import(
  '../widgets/PluginNavigationSettings.js'
)
const { useUpdatePluginMutation, useUpdateAllPluginsMutation } = await import(
  '../data/jsplugin-mutations.js'
)
const { toast } = await import('../../../shared/ui/toast-store.js')

function plugin(path: string, isActive = true): JSPlugin {
  return {
    id: path.charCodeAt(0),
    name: path,
    displayName: path,
    entryPath: path,
    isActive,
  } as JSPlugin
}
function config(paths: string[] = ['b'], showLibrary = true): TabConfig {
  return {
    showLibrary,
    pluginTabs: paths.map((path) => ({
      pluginId: path.charCodeAt(0),
      entryPath: path,
      name: path,
    })),
  }
}
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: Error) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}
function clientAndWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return {
    client,
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  }
}
beforeEach(() => {
  appConfig.reset()
  useAppSessionStore.getState().reset()
  h.read.mockReset().mockResolvedValue(config())
  h.plugins.mockReset().mockResolvedValue({ plugins: [plugin('a'), plugin('b', false)] })
  h.write.mockReset().mockImplementation(async (next) => next)
  h.update.mockClear()
  h.updateAll.mockClear()
})
afterEach(() => {
  toast.clear()
  appConfig.reset()
  useAppSessionStore.getState().reset()
})

test('only installed active entries consume navigation slots', () => {
  expect(navigationTabCount(config(['a', 'b', 'missing']), [plugin('a'), plugin('b', false)])).toBe(
    4,
  )
  expect(navigationTabCount(config(['a', 'b'], false), [plugin('a'), plugin('b', false)])).toBe(3)
})

test('reorder retains disabled slots, library preference and unreported active entries', () => {
  const initial = config(['a', 'b', 'c', 'd'], false)
  const next = reorderActivePluginTabs(
    initial,
    [plugin('a'), plugin('b', false), plugin('c'), plugin('d')],
    ['c', 'c', 'unknown', 'a'],
  )
  expect(next.pluginTabs.map((tab) => tab.entryPath)).toEqual(['c', 'b', 'a', 'd'])
  expect(next.showLibrary).toBe(false)
  expect(initial.pluginTabs.map((tab) => tab.entryPath)).toEqual(['a', 'b', 'c', 'd'])
})

test('a save keeps the saved config and locks every mounted editor, including immediate duplicate taps', async () => {
  const pending = deferred<TabConfig>()
  h.write.mockReturnValueOnce(pending.promise)
  const { wrapper } = clientAndWrapper()
  const { result } = renderHook(() => [useNavigationSettings(), useNavigationSettings()], {
    wrapper,
  })
  await waitFor(() => expect(result.current.every((settings) => settings.ready)).toBe(true))
  let saved!: Promise<void>
  await act(async () => {
    saved = result.current[0]!.save(config(['b', 'a']))
    await result.current[1]!.save(config(['a']))
  })
  await waitFor(() => expect(result.current.every((settings) => settings.saving)).toBe(true))
  expect(h.write).toHaveBeenCalledTimes(1)
  expect(result.current[0]!.config).toEqual(config())
  await act(async () => {
    pending.resolve(config(['b', 'a']))
    await saved
  })
  await waitFor(() => expect(result.current[0]!.ready).toBe(true))
  expect(result.current[1]!.config).toEqual(config(['b', 'a']))
})

test('failed saving retains saved state and permits retry', async () => {
  h.write.mockRejectedValueOnce(new Error('offline'))
  const { wrapper } = clientAndWrapper()
  const { result } = renderHook(useNavigationSettings, { wrapper })
  await waitFor(() => expect(result.current.ready).toBe(true))
  await act(async () => {
    await expect(result.current.save(config(['a']))).rejects.toThrow('offline')
  })
  await waitFor(() => expect(result.current.ready).toBe(true))
  expect(result.current.config).toEqual(config())
  await act(async () => {
    await result.current.save(config(['a']))
  })
  await waitFor(() => expect(result.current.config).toEqual(config(['a'])))
})

test.each(['single', 'all'])(
  '%s plugin update refreshes navigation eligibility and visible count',
  async (operation) => {
    const { wrapper } = clientAndWrapper()
    const { result } = renderHook(
      () => ({
        navigation: useNavigationSettings(),
        single: useUpdatePluginMutation(),
        all: useUpdateAllPluginsMutation(),
      }),
      { wrapper },
    )
    await waitFor(() => expect(result.current.navigation.ready).toBe(true))
    expect(
      navigationTabCount(result.current.navigation.config!, result.current.navigation.plugins),
    ).toBe(3)
    h.plugins.mockResolvedValue({ plugins: [plugin('a'), plugin('b')] })
    await act(async () => {
      if (operation === 'single') await result.current.single.mutateAsync({ id: 98 })
      else await result.current.all.mutateAsync({})
    })
    await waitFor(() => {
      expect(result.current.navigation.ready).toBe(true)
      expect(
        navigationTabCount(result.current.navigation.config!, result.current.navigation.plugins),
      ).toBe(4)
    })
  },
)

test('a refresh begun during saving cannot overwrite the normalized saved response', async () => {
  const write = deferred<TabConfig>()
  const refresh = deferred<TabConfig>()
  h.write.mockReturnValueOnce(write.promise)
  const { client, wrapper } = clientAndWrapper()
  const { result } = renderHook(useNavigationSettings, { wrapper })
  await waitFor(() => expect(result.current.ready).toBe(true))
  let saved!: Promise<void>
  let refreshed!: Promise<void>
  await act(async () => {
    saved = result.current.save(config(['b', 'a', 'orphan']))
  })
  h.read.mockReturnValueOnce(refresh.promise).mockResolvedValue(config(['b', 'a']))
  await act(async () => {
    refreshed = client.invalidateQueries({ queryKey: ['settings', 'tab-config'] })
  })
  await waitFor(() => expect(result.current.fetching).toBe(true))
  await act(async () => {
    write.resolve(config(['b', 'a']))
    await saved
  })
  await act(async () => {
    refresh.resolve(config(['b']))
    await refreshed
  })
  await waitFor(() => expect(result.current.ready).toBe(true))
  expect(result.current.config).toEqual(config(['b', 'a']))
})

test.each(['config', 'plugins'])(
  'initial %s read failure blocks writes and retry recovers',
  async (failure) => {
    if (failure === 'config') h.read.mockRejectedValueOnce(new Error('read failed'))
    else h.plugins.mockRejectedValueOnce(new Error('read failed'))
    const { wrapper } = clientAndWrapper()
    const { result } = renderHook(useNavigationSettings, { wrapper })
    await waitFor(() => expect(result.current.error).toBe(true))
    await act(async () => {
      await result.current.save(config(['a']))
    })
    expect(h.write).not.toHaveBeenCalled()
    await act(async () => result.current.retry())
    await waitFor(() => expect(result.current.ready).toBe(true))
  },
)

test.each(['config', 'plugins'])(
  'refresh %s failure retains old data but prevents overwriting with it',
  async (failure) => {
    const { client, wrapper } = clientAndWrapper()
    const { result } = renderHook(useNavigationSettings, { wrapper })
    await waitFor(() => expect(result.current.ready).toBe(true))
    if (failure === 'config') h.read.mockRejectedValueOnce(new Error('refresh failed'))
    else h.plugins.mockRejectedValueOnce(new Error('refresh failed'))
    await act(async () => {
      await client.invalidateQueries({ queryKey: ['settings', 'tab-config'] })
    })
    await waitFor(() => expect(result.current.error).toBe(true))
    expect(result.current.config).toEqual(config())
    expect(result.current.ready).toBe(false)
    await act(async () => {
      await result.current.save(config(['a']))
    })
    expect(h.write).not.toHaveBeenCalled()
  },
)

test('old server save cannot replace new server config or unlock its pending write', async () => {
  const old = deferred<TabConfig>()
  const next = deferred<TabConfig>()
  h.write.mockReturnValueOnce(old.promise).mockReturnValueOnce(next.promise)
  const { client, wrapper } = clientAndWrapper()
  const { result } = renderHook(useNavigationSettings, { wrapper })
  await waitFor(() => expect(result.current.ready).toBe(true))
  let oldSave!: Promise<void>
  await act(async () => {
    oldSave = result.current.save(config(['a']))
  })
  h.read.mockResolvedValue(config(['new'], false))
  await act(async () => {
    appConfig.baseUrl = 'https://second.example'
    appConfig.resolvedBaseUrl = appConfig.baseUrl
    useAppSessionStore.getState().setBaseUrl(appConfig.baseUrl)
    client.clear()
  })
  await waitFor(() => expect(result.current.ready).toBe(true))
  expect(result.current.config).toEqual(config(['new'], false))
  let newSave!: Promise<void>
  await act(async () => {
    newSave = result.current.save(config(['new', 'a'], false))
  })
  await waitFor(() => expect(result.current.saving).toBe(true))
  await act(async () => {
    old.resolve(config(['a']))
    await oldSave
  })
  expect(result.current.config).toEqual(config(['new'], false))
  expect(result.current.saving).toBe(true)
  await act(async () => {
    next.resolve(config(['new', 'a'], false))
    await newSave
  })
  await waitFor(() => expect(result.current.ready).toBe(true))
  expect(result.current.config).toEqual(config(['new', 'a'], false))
})

function Controls({ empty = false, path = 'a' }: { empty?: boolean; path?: string }) {
  const settings = useNavigationSettings()
  return (
    <>
      <PluginNavigationToggle
        plugin={empty ? { ...plugin(path), entryPath: '' } : plugin(path)}
        settings={settings}
        busy={false}
      />
      <PluginNavigationToggle plugin={plugin('b', false)} settings={settings} busy={false} />
      <BuiltInNavigationSettings settings={settings} busy={false} />
      <PluginNavigationOrder settings={settings} busy={false} />
      <NavigationSummary settings={settings} />
    </>
  )
}

test('active tab drag handles consume native swipes without locking the surrounding section', async () => {
  h.read.mockResolvedValue(config(['a', 'b']))
  h.plugins.mockResolvedValue({ plugins: [plugin('a'), plugin('b')] })
  const { wrapper } = clientAndWrapper()
  render(<Controls />, { wrapper })
  await waitFor(() =>
    expect(
      getQueriesForElement(elementTree.root!).queryByTestId('tab-order-handle-a'),
    ).toBeInTheDocument(),
  )
  const handles = getQueriesForElement(elementTree.root!).queryAllByTestId(/^tab-order-handle-/)
  expect(handles).toHaveLength(2)
  for (const handle of handles) {
    expect(handle).toHaveAttribute('consume-slide-event', JSON.stringify([[-180, 180]]))
  }
  expect(elementTree.root!.querySelectorAll('[consume-slide-event]')).toHaveLength(handles.length)
})

test('an obsolete write after clearing the same server cache cannot lock or overwrite the new editor', async () => {
  const old = deferred<TabConfig>()
  h.write.mockReturnValueOnce(old.promise)
  const { client, wrapper } = clientAndWrapper()
  const first = renderHook(useNavigationSettings, { wrapper })
  await waitFor(() => expect(first.result.current.ready).toBe(true))
  const staleSave = first.result.current.save
  let oldSave!: Promise<void>
  await act(async () => {
    oldSave = staleSave(config(['a']))
  })
  first.unmount()
  client.clear()
  h.read.mockResolvedValue(config(['new']))
  const second = renderHook(useNavigationSettings, { wrapper })
  await waitFor(() => expect(second.result.current.ready).toBe(true))
  await act(async () => {
    await staleSave(config(['old']))
  })
  expect(h.write).toHaveBeenCalledTimes(1)
  await act(async () => {
    old.resolve(config(['a']))
    await oldSave
  })
  expect(second.result.current.config).toEqual(config(['new']))
})

test('refresh error disables controls with retained preferences and renders retry', async () => {
  h.read.mockResolvedValue(config(['a', 'b']))
  const { client, wrapper } = clientAndWrapper()
  render(<Controls />, { wrapper })
  await waitFor(() =>
    expect(getQueriesForElement(elementTree.root!).queryByText('4/12')).toBeInTheDocument(),
  )
  h.read.mockRejectedValueOnce(new Error('read failed'))
  await act(async () => {
    await client.invalidateQueries({ queryKey: ['settings', 'tab-config'] })
  })
  const queries = getQueriesForElement(elementTree.root!)
  await waitFor(() =>
    expect(
      queries.getByTestId('plugin-navigation-97').querySelector('.app-switch')!.className,
    ).toContain('ui-disabled'),
  )
  expect(
    queries.getByTestId('plugin-navigation-97').querySelector('.app-switch')!.className,
  ).toContain('ui-checked')
  await act(async () => {
    fireEvent.tap(queries.getByTestId('plugin-navigation-97').querySelector('.app-switch')!)
  })
  expect(h.write).not.toHaveBeenCalled()
  await act(async () => {
    fireEvent.tap(queries.getByTestId('navigation-retry'))
  })
  await waitFor(() =>
    expect(
      queries.getByTestId('plugin-navigation-97').querySelector('.app-switch')!.className,
    ).not.toContain('ui-disabled'),
  )
})

test('navigation toggle preserves disabled preferences and library setting', async () => {
  h.read.mockResolvedValue(config(['b'], false))
  const { wrapper } = clientAndWrapper()
  render(<Controls />, { wrapper })
  await waitFor(() =>
    expect(getQueriesForElement(elementTree.root!).queryByText('2/12')).toBeInTheDocument(),
  )
  const { getByTestId } = getQueriesForElement(elementTree.root!)
  expect(getByTestId('plugin-navigation-98').querySelector('.app-switch')!.className).toContain(
    'ui-checked',
  )
  await act(async () => {
    fireEvent.tap(getByTestId('plugin-navigation-97').querySelector('.app-switch')!)
  })
  await waitFor(() => expect(h.write).toHaveBeenCalledTimes(1))
  expect(h.write.mock.calls[0]![0]).toEqual(config(['b', 'a'], false))
})

test('full navigation blocks additions but allows removing an active tab', async () => {
  const paths = Array.from({ length: 9 }, (_, index) => String(index))
  h.read.mockResolvedValue(config(paths))
  h.plugins.mockResolvedValue({
    plugins: paths.map((path) => plugin(path)).concat(plugin('a'), plugin('b', false)),
  })
  const { wrapper } = clientAndWrapper()
  const rendered = render(<Controls />, { wrapper })
  await waitFor(() =>
    expect(getQueriesForElement(elementTree.root!).queryByText('12/12')).toBeInTheDocument(),
  )
  const { getByTestId } = getQueriesForElement(elementTree.root!)
  await act(async () => {
    fireEvent.tap(getByTestId('plugin-navigation-97').querySelector('.app-switch')!)
  })
  expect(h.write).not.toHaveBeenCalled()
  await act(async () => {
    rendered.rerender(<Controls path='0' />)
  })
  await act(async () => {
    fireEvent.tap(
      getQueriesForElement(elementTree.root!)
        .getByTestId('plugin-navigation-48')
        .querySelector('.app-switch')!,
    )
  })
  await waitFor(() => expect(h.write).toHaveBeenCalledTimes(1))
  expect(h.write.mock.calls[0]![0].pluginTabs.map((tab) => tab.entryPath)).toEqual(paths.slice(1))
})

test('plugins with empty entry paths have no navigation control', async () => {
  const { wrapper } = clientAndWrapper()
  render(<Controls empty />, { wrapper })
  await waitFor(() =>
    expect(getQueriesForElement(elementTree.root!).queryByText('3/12')).toBeInTheDocument(),
  )
  expect(
    getQueriesForElement(elementTree.root!).queryByTestId('plugin-navigation-97'),
  ).not.toBeInTheDocument()
})

test('built-in navigation sits between plugin controls and ordering and preserves their config', async () => {
  h.read.mockResolvedValue(config(['a', 'b']))
  const { wrapper } = clientAndWrapper()
  render(<Controls />, { wrapper })
  await waitFor(() =>
    expect(getQueriesForElement(elementTree.root!).queryByText('4/12')).toBeInTheDocument(),
  )
  const queries = getQueriesForElement(elementTree.root!)
  const sections = [...elementTree.root!.querySelectorAll('[data-testid]')].map((node) => node.getAttribute('data-testid'))
  expect(sections.indexOf('plugin-navigation-98')).toBeLessThan(sections.indexOf('built-in-navigation'))
  expect(sections.indexOf('built-in-navigation')).toBeLessThan(sections.indexOf('plugin-navigation-order'))
  expect(sections.indexOf('plugin-navigation-order')).toBeLessThan(sections.indexOf('navigation-summary'))
  await act(async () => {
    fireEvent.tap(queries.getByTestId('tab-toggle-library').querySelector('.app-switch')!)
  })
  await waitFor(() => expect(h.write).toHaveBeenCalledTimes(1))
  expect(h.write.mock.calls[0]![0]).toEqual(config(['a', 'b'], false))
})

test('the library switch remains available without installed plugins', async () => {
  h.read.mockResolvedValue(config([]))
  h.plugins.mockResolvedValue({ plugins: [] })
  const { wrapper } = clientAndWrapper()
  render(<Controls />, { wrapper })
  await waitFor(() => expect(getQueriesForElement(elementTree.root!).queryByText('3/12')).toBeInTheDocument())
  const queries = getQueriesForElement(elementTree.root!)
  expect(queries.queryByTestId('plugin-navigation-order')).not.toBeInTheDocument()
  await act(async () => {
    fireEvent.tap(queries.getByTestId('tab-toggle-library').querySelector('.app-switch')!)
  })
  await waitFor(() => expect(h.write).toHaveBeenCalledTimes(1))
  expect(h.write.mock.calls[0]![0]).toEqual(config([], false))
})

test('at the limit, library additions are blocked until a visible plugin is removed', async () => {
  const paths = Array.from({ length: 10 }, (_, index) => String(index))
  h.read.mockResolvedValue(config(paths, false))
  h.plugins.mockResolvedValue({ plugins: paths.map((path) => plugin(path)) })
  const { wrapper } = clientAndWrapper()
  render(<Controls path='0' />, { wrapper })
  const queries = getQueriesForElement(elementTree.root!)
  await waitFor(() => expect(queries.queryByText('12/12')).toBeInTheDocument())
  await act(async () => {
    fireEvent.tap(queries.getByTestId('tab-toggle-library').querySelector('.app-switch')!)
  })
  expect(h.write).not.toHaveBeenCalled()
  await act(async () => {
    fireEvent.tap(queries.getByTestId('plugin-navigation-48').querySelector('.app-switch')!)
  })
  await waitFor(() => expect(queries.queryByText('11/12')).toBeInTheDocument())
  await act(async () => {
    fireEvent.tap(queries.getByTestId('tab-toggle-library').querySelector('.app-switch')!)
  })
  await waitFor(() => expect(h.write).toHaveBeenCalledTimes(2))
  expect(h.write.mock.calls[1]![0]).toEqual(config(paths.slice(1), true))
})
