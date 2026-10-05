import { afterEach, expect, test, vi } from 'vitest'
import { createFetchTransport, HttpClient, type TransportRequest } from '../../../core/network/http-client.js'
import { JSPluginApi } from '../api/jsplugin-api.js'

afterEach(() => vi.useRealTimers())

test('plugin operations use their own deadlines and keep ordinary requests at 15 seconds', async () => {
  const calls: TransportRequest[] = []
  const client = new HttpClient({
    getBaseUrl: () => 'http://api.example',
    transport: async req => {
      calls.push(req)
      return {status: 200, headers: {}, body: JSON.stringify({plugins: [], results: [], total: 0})}
    },
  })
  const api = new JSPluginApi(client)
  await api.checkUpdate(1, {githubProxy: 'https://proxy.example'})
  await api.updatePlugin(1, {force: true})
  await api.updateAllPlugins({force: true})
  await api.refreshRegistry({allSources: true})
  await api.installFromRegistry({downloadUrl: 'https://download.example/plugin.zip', overwrite: true})
  await api.getPlugins()
  expect(calls.map(req => req.timeoutMs)).toEqual([45_000, 240_000, 1_800_000, 60_000, 240_000, 15_000])
  expect(calls[0]!.url).toContain('github_proxy=https%3A%2F%2Fproxy.example')
  expect(JSON.parse(calls[1]!.body!)).toEqual({force: true})
  expect(JSON.parse(calls[4]!.body!)).toEqual({download_url: 'https://download.example/plugin.zip', overwrite: true})
})

test('a plugin update that answers after 40 seconds succeeds', async () => {
  vi.useFakeTimers()
  const transport = createFetchTransport(() => new Promise(resolve => {
    setTimeout(() => resolve({status: 200, headers: {}, text: async () => '{}'}), 40_000)
  }))
  const api = new JSPluginApi(new HttpClient({transport, getBaseUrl: () => 'http://api.example'}))
  const update = api.updatePlugin(1)
  const failure = vi.fn()
  void update.catch(failure)
  await vi.advanceTimersByTimeAsync(40_001)
  await expect(update).resolves.toBeUndefined()
  expect(failure).not.toHaveBeenCalled()
})
