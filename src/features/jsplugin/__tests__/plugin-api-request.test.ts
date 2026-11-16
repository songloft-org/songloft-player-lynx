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

test.each(['GET', 'POST', 'PUT', 'DELETE'])(
  'forwards %s using the frame identity',
  async (method) => {
    h.request.mockResolvedValue({ data: { saved: true } })
    await expect(
      pluginApiRequest('miot', {
        method,
        path: '/api/groups?id=a%2Fb',
        body: { name: '卧室' },
        entryPath: 'other',
      }),
    ).resolves.toEqual({ saved: true })
    expect(h.request).toHaveBeenLastCalledWith(
      '/api/v1/jsplugin/miot/api/groups?id=a%2Fb',
      {
        method,
        body: { name: '卧室' },
        receiveTimeoutMs: 60000,
      },
    )
  },
)

test('rejects unsupported methods without a network request', async () => {
  h.request.mockClear()
  await expect(
    pluginApiRequest('miot', { method: 'PATCH', path: '/api/config' }),
  ).rejects.toThrow('invalid')
  expect(h.request).not.toHaveBeenCalled()
})
