import { beforeEach, describe, expect, it, vi } from 'vitest'
import { initializeDesktopUpdates, startDesktopUpdates } from '../updates.js'

const mocks = vi.hoisted(() => ({
  call: vi.fn(async () => {}),
  addListener: vi.fn(),
  proxy: vi.fn<() => Promise<string>>(),
  authStatus: 'authenticated',
  enabled: true,
  session: { baseUrl: 'https://music.example', username: 'admin' },
}))
vi.mock('../client.js', () => ({
  desktopCall: mocks.call,
  desktopConfig: () => ({ capabilities: { updates: mocks.enabled } }),
}))
vi.mock('../../features/settings/api/index.js', () => ({
  getSettingsApi: () => ({ getGithubProxy: mocks.proxy }),
}))
vi.mock('../../features/auth/store/index.js', () => ({
  useAuthStore: { getState: () => ({ status: mocks.authStatus }) },
}))
vi.mock('../../store/app-session.js', () => ({
  useAppSessionStore: { getState: () => mocks.session },
}))
vi.mock('../../native/native-modules.js', () => ({
  readLynxGlobal: () => ({
    getJSModule: () => ({ addListener: mocks.addListener }),
  }),
}))

function handleProxyRequest() {
  initializeDesktopUpdates()
  expect(mocks.addListener).toHaveBeenCalledWith(
    'SongloftDesktop.updateProxyRequested',
    expect.any(Function),
  )
  return mocks.addListener.mock.calls[0][1] as (request: {
    id: string
  }) => Promise<void>
}

describe('desktop update startup', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.authStatus = 'authenticated'
    mocks.enabled = true
    mocks.session = { baseUrl: 'https://music.example', username: 'admin' }
  })

  it('starts the host schedule and answers proxy requests with the current setting', async () => {
    const resolve = handleProxyRequest()
    startDesktopUpdates()
    expect(mocks.call.mock.calls).toEqual([
      ['update.confirm'],
      ['update.startAutomatic'],
    ])
    mocks.proxy.mockResolvedValueOnce('https://mirror.example')
    await resolve({ id: 'automatic-check' })
    expect(mocks.call).toHaveBeenLastCalledWith('update.proxyResolved', {
      id: 'automatic-check',
      githubProxy: 'https://mirror.example',
    })
    mocks.proxy.mockResolvedValueOnce('')
    await resolve({ id: 'manual-check' })
    expect(mocks.call).toHaveBeenLastCalledWith('update.proxyResolved', {
      id: 'manual-check',
      githubProxy: '',
    })
  })

  it('uses direct access when signed out or after an in-flight server change', async () => {
    const resolve = handleProxyRequest()
    const read = Promise.withResolvers<string>()
    mocks.proxy.mockReturnValueOnce(read.promise)
    const oldRequest = resolve({ id: 'before-switch' })
    mocks.session = { baseUrl: 'https://next.example', username: 'admin' }
    read.resolve('https://old.example')
    await oldRequest
    expect(mocks.call).toHaveBeenLastCalledWith('update.proxyResolved', {
      id: 'before-switch',
      githubProxy: '',
    })
    mocks.authStatus = 'unauthenticated'
    await resolve({ id: 'signed-out' })
    expect(mocks.proxy).toHaveBeenCalledTimes(1)
    expect(mocks.call).toHaveBeenLastCalledWith('update.proxyResolved', {
      id: 'signed-out',
      githubProxy: '',
    })
  })
})
