import type { ReactNode } from '@lynx-js/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, renderHook, waitFor } from '@lynx-js/react/testing-library'
import { expect, test, vi } from 'vitest'

import type { JSPlugin } from '../../../models/jsplugin.js'
import { appConfig } from '../../../core/config/app-config.js'
import { getSongloftStorage, setSongloftStorage, createMemoryStorage } from '../../../core/storage/index.js'
import { useAppSessionStore } from '../../../store/app-session.js'
import { filterActivePluginTabs, useShellNavTabs, type PluginTabEntry, type TabConfig } from '../data/tab-config.js'
import { PluginTabIcon } from '../widgets/PluginTabIcon.js'

/**
 * A plugin tab renders on the nav bar only while its plugin is installed AND
 * enabled — Flutter's `active_destinations.dart` rule. The reported bug was the
 * icon of a disabled plugin staying on the bar: the shell-nav query listed
 * every configured tab without checking `isActive`, and the toggle mutation
 * never invalidated that query. These pin both halves of the fix.
 */

function makePlugin(over: Partial<JSPlugin> = {}): JSPlugin {
  return {
    id: 1,
    name: 'lx',
    entryPath: 'lx',
    filePath: '',
    status: 'active',
    permissions: [],
    createdAt: '',
    updatedAt: '',
    isActive: true,
    isError: false,
    displayName: 'LX',
    ...over,
  } as JSPlugin
}

function makeTab(entryPath: string): PluginTabEntry {
  return { pluginId: 1, entryPath, name: entryPath, icon: undefined }
}

test('an active installed plugin keeps its tab', () => {
  const tabs = filterActivePluginTabs(
    [makeTab('lx')],
    [makePlugin()],
  )
  expect(tabs.map((t) => t.entryPath)).toEqual(['lx'])
})

test('a disabled plugin loses its tab', () => {
  const tabs = filterActivePluginTabs(
    [makeTab('lx')],
    [makePlugin({ status: 'inactive', isActive: false })],
  )
  expect(tabs).toEqual([])
})

test('an uninstalled plugin loses its tab (config outlives the plugin)', () => {
  // Deleting a plugin does not rewrite the saved tab config — the bar must
  // still drop the orphaned entry.
  const tabs = filterActivePluginTabs(
    [makeTab('lx')],
    [],
  )
  expect(tabs).toEqual([])
})

test('plugins without an entryPath never match any tab', () => {
  const tabs = filterActivePluginTabs(
    [makeTab('lx')],
    [makePlugin({ entryPath: undefined })],
  )
  expect(tabs).toEqual([])
})

/*
 * The invalidation half: toggling (or deleting / installing) must refresh the
 * shell-nav query, or a disabled plugin's tab lingers until the query's 60s
 * staleTime lapses. The hooks run against a real QueryClient with the api
 * module mocked; the invalidation is asserted on the client itself.
 */
const h = vi.hoisted(() => ({
  getTabConfig: vi.fn<() => Promise<TabConfig>>(),
  getPlugins: vi.fn(async () => ({ plugins: [makePlugin({ icon: 'icon.svg' })] })),
  getStaticText: vi.fn<() => Promise<string>>(),
  enable: vi.fn(async () => makePlugin()),
  disable: vi.fn(async () => makePlugin({ status: 'inactive', isActive: false })),
  del: vi.fn(async () => {}),
  install: vi.fn(async () => ({})),
}))

vi.mock('../api/index.js', () => ({
  getJSPluginApi: () => ({
    getPlugins: h.getPlugins,
    getStaticText: h.getStaticText,
    enablePlugin: h.enable,
    disablePlugin: h.disable,
    deletePlugin: h.del,
    installFromRegistry: h.install,
  }),
}))

vi.mock('../../settings/api/index.js', () => ({
  getSettingsApi: () => ({ getTabConfig: h.getTabConfig }),
}))

const { useTogglePluginMutation, useDeletePluginMutation, useInstallFromRegistryMutation } =
  await import('../data/jsplugin-mutations.js')

function withClient(client: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
}

test('toggling a plugin invalidates the shell-nav tab query', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const spy = vi.spyOn(client, 'invalidateQueries')
  const { result } = renderHook(() => useTogglePluginMutation(), { wrapper: withClient(client) })

  await act(async () => {
    await result.current.mutateAsync({ id: 1, enable: false })
  })

  expect(h.disable).toHaveBeenCalledWith(1)
  expect(spy).toHaveBeenCalledWith({ queryKey: ['settings', 'tab-config'] })
})

test('deleting a plugin invalidates the shell-nav tab query', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const spy = vi.spyOn(client, 'invalidateQueries')
  const { result } = renderHook(() => useDeletePluginMutation(), { wrapper: withClient(client) })

  await act(async () => {
    await result.current.mutateAsync({ id: 1 })
  })

  expect(spy).toHaveBeenCalledWith({ queryKey: ['settings', 'tab-config'] })
})

test('installing from the registry invalidates the shell-nav tab query', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const spy = vi.spyOn(client, 'invalidateQueries')
  const { result } = renderHook(() => useInstallFromRegistryMutation(), {
    wrapper: withClient(client),
  })

  await act(async () => {
    await result.current.mutateAsync({
      downloadUrl: 'https://x/lx.zip',
    } as Parameters<typeof result.current.mutateAsync>[0])
  })

  expect(spy).toHaveBeenCalledWith({ queryKey: ['settings', 'tab-config'] })
})

test.each(['remote', 'mobile bundle'])(
  '%s restores the last tabs and applies successful changes only for the current account',
  async (mode) => {
    const storage = getSongloftStorage()
    const baseUrl = appConfig.baseUrl
    const bundleBackendBaseUrl = appConfig.bundleBackendBaseUrl
    const username = useAppSessionStore.getState().username
    const snapshot = createMemoryStorage()
    const clients: QueryClient[] = []
    const boot = () => {
      const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
      clients.push(client)
      return { client, ...renderHook(() => useShellNavTabs(), { wrapper: withClient(client) }) }
    }
    const first: TabConfig = { showLibrary: false, pluginTabs: [makeTab('lx')] }
    const changed: TabConfig = { showLibrary: true, pluginTabs: [] }
    try {
      setSongloftStorage(snapshot)
      appConfig.baseUrl = mode === 'remote' ? 'https://nav.example.test/subpath' : 'http://127.0.0.1:59301'
      appConfig.bundleBackendBaseUrl = mode === 'remote' ? null : appConfig.baseUrl
      useAppSessionStore.getState().setUsername('first-user')
      h.getTabConfig.mockResolvedValueOnce(first)
      h.getStaticText.mockResolvedValue('<!doctype html><title>SPA fallback</title>')
      const original = boot()
      await waitFor(() => expect(original.result.current.data?.pluginTabs[0]?.icon).toBe('icon.svg'))
      original.unmount()

      // The same in-process library can listen on a different port after restart.
      if (mode === 'mobile bundle') {
        appConfig.baseUrl = 'http://127.0.0.1:59302'
        appConfig.bundleBackendBaseUrl = appConfig.baseUrl
      }

      let finish!: (value: TabConfig) => void
      h.getTabConfig.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
      const restarted = boot()
      await waitFor(() => {
        expect(restarted.result.current.data).toEqual({
          ...first, pluginTabs: [{ ...makeTab('lx'), icon: 'icon.svg', svgMarkup: null }],
        })
        expect(restarted.result.current.isRestoring).toBe(false)
        expect(finish).toBeTypeOf('function')
      })
      const cached = restarted.result.current.data
      await act(async () => { finish(first) })
      await waitFor(() => expect(restarted.client.isFetching()).toBe(0))
      expect(restarted.result.current.data).toBe(cached)

      h.getTabConfig.mockRejectedValueOnce(new Error('offline'))
      await act(async () => { await restarted.client.invalidateQueries({ queryKey: ['settings', 'tab-config'] }) })
      expect(restarted.result.current.data).toBe(cached)

      h.getTabConfig.mockResolvedValueOnce(changed)
      await act(async () => { await restarted.client.invalidateQueries({ queryKey: ['settings', 'tab-config'] }) })
      await waitFor(() => expect(restarted.result.current.data).toEqual(changed))
      restarted.unmount()

      h.getTabConfig.mockRejectedValue(new Error('offline'))
      const offline = boot()
      await waitFor(() => expect(offline.result.current.data).toEqual(changed))
      offline.unmount()

      useAppSessionStore.getState().setUsername('other-user')
      const another = boot()
      await waitFor(() => expect(h.getTabConfig).toHaveBeenCalledTimes(6))
      expect(another.result.current.data).toBeUndefined()
      another.unmount()
    } finally {
      h.getTabConfig.mockReset()
      h.getStaticText.mockReset()
      for (const client of clients) client.clear()
      appConfig.baseUrl = baseUrl
      appConfig.bundleBackendBaseUrl = bundleBackendBaseUrl
      useAppSessionStore.getState().setUsername(username)
      setSongloftStorage(storage)
    }
  },
)

test('the first visible plugin tab frame restores SVG markup, including during failed revalidation', async () => {
  const previousStorage = getSongloftStorage()
  const previousUsername = useAppSessionStore.getState().username
  const storage = createMemoryStorage()
  const config: TabConfig = { showLibrary: true, pluginTabs: [makeTab('lx')] }
  const markup = '<svg viewBox="0 0 24 24"><circle r="6"/></svg>'
  const clients: QueryClient[] = []
  const views: ReturnType<typeof render>[] = []
  const boot = () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    clients.push(client)
    function Nav() {
      const { data, isRestoring } = useShellNavTabs()
      const tab = data?.pluginTabs[0]
      if (isRestoring || !tab) return null
      return <PluginTabIcon tab={tab} active={false} />
    }
    const view = render(<Nav />, { wrapper: withClient(client) })
    views.push(view)
    const container = view.container as unknown as HTMLElement
    const readIcon = () => container.querySelector('svg')?.getAttribute('content') ?? null
    return { client, container, readIcon, unmount: view.unmount }
  }

  try {
    setSongloftStorage(storage)
    useAppSessionStore.getState().setUsername('nav-icon-user')
    h.getTabConfig.mockResolvedValue(config)
    let finish!: (value: string) => void
    let fail!: (error: Error) => void
    h.getStaticText.mockImplementation(() => new Promise((resolve, reject) => {
      finish = resolve
      fail = reject
    }))
    const first = boot()
    await waitFor(() => expect(finish).toBeTypeOf('function'))
    await waitFor(() => expect(first.container.firstElementChild).toBeTruthy())
    const firstHadGear = Boolean(first.container.querySelector('[data-icon="settings"]'))
    await act(async () => { finish(markup) })
    await waitFor(() => expect(first.readIcon()).toBe(markup))
    first.unmount()

    h.getTabConfig.mockRejectedValue(new Error('offline'))
    const restarted = boot()
    await waitFor(() => expect(restarted.container.firstElementChild).toBeTruthy())
    expect(restarted.readIcon()).toBe(markup)
    await waitFor(() => expect(h.getStaticText).toHaveBeenCalledTimes(2))
    await act(async () => { fail(new Error('offline')) })
    await waitFor(() => expect(restarted.client.isFetching()).toBe(0))
    expect(restarted.readIcon()).toBe(markup)
    h.getStaticText.mockResolvedValue('<!doctype html><title>SPA fallback</title>')
    await act(async () => { await restarted.client.refetchQueries({ queryKey: ['shell-nav-icon'] }) })
    expect(restarted.readIcon()).toBe(markup)
    expect(firstHadGear).toBe(false)
  } finally {
    for (const view of views) view.unmount()
    for (const client of clients) client.clear()
    h.getTabConfig.mockReset()
    h.getStaticText.mockReset()
    useAppSessionStore.getState().setUsername(previousUsername)
    setSongloftStorage(previousStorage)
  }
})
