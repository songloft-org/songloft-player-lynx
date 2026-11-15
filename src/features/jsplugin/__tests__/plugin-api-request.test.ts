import { expect, test, vi } from 'vitest'
const h = vi.hoisted(() => ({ request: vi.fn() }))
vi.mock('../../../core/network/api-client.js', () => ({
  getSharedClient: () => ({ request: h.request }),
}))
vi.mock('../../../core/config/app-config.js', () => ({ apiPrefix: '/api/v1' }))
import { pluginApiRequest } from '../domain/plugin-api-request.js'
test('binds requests to the host frame identity', async () => {
  h.request.mockResolvedValue({ data: { ok: true } })
  await expect(
    pluginApiRequest('bili', {
      method: 'POST',
      path: '/api/import',
      body: {},
      entryPath: 'other',
    }),
  ).resolves.toEqual({ ok: true })
  expect(h.request).toHaveBeenLastCalledWith(
    '/api/v1/jsplugin/bili/api/import',
    { method: 'POST', body: {}, receiveTimeoutMs: 60000 },
  )
})
test('rejects paths outside the plugin', async () => {
  for (const path of [
    '//evil/api',
    '/api/../other',
    '/api/%2e%2e',
    '/api/x\\y',
    '/api/x#fragment',
    '/other',
  ]) {
    await expect(
      pluginApiRequest('bili', { method: 'GET', path }),
    ).rejects.toThrow('invalid')
  }
})
