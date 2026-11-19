import { expect, test, vi } from 'vitest'
const h = vi.hoisted(() => ({
  open: vi.fn(),
  send: vi.fn(),
  close: vi.fn(),
  get: vi.fn(async () => 'test-token'),
}))
vi.mock('../../../core/config/app-config.js', () => ({
  appConfig: { baseUrl: 'https://host.test', basePath: '/music' },
}))
vi.mock('../../../core/storage/index.js', () => ({
  getSongloftStorage: () => ({ secure: { get: h.get } }),
}))
vi.mock('../../../native/web-platform.js', () => ({
  isWebPlatform: () => false,
}))
vi.mock('../../../native/native-modules.js', () => ({
  readLynxGlobal: () => null,
  readNativeModules: () => ({
    SongloftPluginBridge: {
      socketOpen: h.open,
      socketSend: h.send,
      socketClose: h.close,
    },
  }),
}))
import { pluginSocketRequest } from '../domain/plugin-socket.js'
test('close while credentials are pending prevents a late socket from opening', async () => {
  let resolve!: (value: string) => void
  h.get.mockImplementationOnce(
    () =>
      new Promise<string>((done) => {
        resolve = done
      }),
  )
  const opened = h.open.mock.calls.length
  const pending = pluginSocketRequest('miot', 'pending-frame', 'socketOpen', {
    id: 'socket-9',
    path: '/status/ws',
  })
  await pluginSocketRequest('miot', 'pending-frame', 'socketClose', {
    id: 'socket-9',
  })
  resolve('token')
  await pending
  expect(h.open.mock.calls.length).toBe(opened)
})
test('socket identity, authentication and base path come from the host frame', async () => {
  await pluginSocketRequest('miot', 'frame-miot', 'socketOpen', {
    id: 'socket-1',
    path: '/status/ws?device_id=a',
    entryPath: 'other',
  })
  expect(h.open).toHaveBeenLastCalledWith(
    'frame-miot',
    'socket-1',
    'wss://host.test/music/api/v1/jsplugin/miot/status/ws?device_id=a&access_token=test-token',
  )
  await pluginSocketRequest('miot', 'frame-miot', 'socketSend', {
    id: 'socket-1',
    data: 'refresh',
  })
  expect(h.send).toHaveBeenLastCalledWith('frame-miot', 'socket-1', 'refresh')
  await pluginSocketRequest('miot', 'frame-miot', 'socketClose', {
    id: 'socket-1',
  })
  expect(h.close).toHaveBeenLastCalledWith('frame-miot', 'socket-1')
})
test('socket bridge rejects absolute, encoded and traversing routes and oversized data', async () => {
  for (const path of [
    'https://evil.test',
    '//evil',
    '/../bili',
    '/x/%2f',
    '/x#fragment',
  ])
    await expect(
      pluginSocketRequest('miot', 'frame', 'socketOpen', {
        id: 'socket-1',
        path,
      }),
    ).rejects.toThrow('invalid')
  await expect(
    pluginSocketRequest('miot', 'frame', 'socketSend', {
      id: 'socket-1',
      data: 'x'.repeat(65537),
    }),
  ).rejects.toThrow('invalid')
  await expect(
    pluginSocketRequest('miot', 'frame', 'socketClose', { id: 'other' }),
  ).rejects.toThrow('invalid')
})
