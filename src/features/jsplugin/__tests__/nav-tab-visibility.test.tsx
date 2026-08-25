import type { ReactNode } from '@lynx-js/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@lynx-js/react/testing-library'
import { expect, test, vi } from 'vitest'

import type { JSPlugin } from '../../../models/jsplugin.js'
import { filterActivePluginTabs, type PluginTabEntry } from '../data/tab-config.js'

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
  enable: vi.fn(async () => makePlugin()),
  disable: vi.fn(async () => makePlugin({ status: 'inactive', isActive: false })),
  del: vi.fn(async () => {}),
  install: vi.fn(async () => ({})),
}))

vi.mock('../api/index.js', () => ({
  getJSPluginApi: () => ({
    enablePlugin: h.enable,
    disablePlugin: h.disable,
    deletePlugin: h.del,
    installFromRegistry: h.install,
  }),
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
