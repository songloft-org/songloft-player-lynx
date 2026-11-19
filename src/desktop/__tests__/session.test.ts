import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  desktopCall: vi.fn(),
  setDesktopSessionKind: vi.fn(),
  setAuthState: vi.fn(),
  getStorage: vi.fn(),
  appConfig: { bundleBackendBaseUrl: null as string | null },
}))

vi.mock('../client.js', () => ({
  desktopCall: mocks.desktopCall,
  desktopConfig: () => ({ token: 'fixture' }),
  setDesktopSessionKind: mocks.setDesktopSessionKind,
}))
vi.mock('../../core/config/app-config.js', () => ({
  appConfig: mocks.appConfig,
}))
vi.mock('../../core/storage/index.js', () => ({
  getSongloftStorage: mocks.getStorage,
}))
vi.mock('../../features/auth/store/index.js', () => ({
  useAuthStore: { setState: mocks.setAuthState },
}))
vi.mock('../../features/player/store/index.js', () => ({ usePlayerStore: {} }))
vi.mock('../../native/audio-facade.js', () => ({ getAudio: vi.fn() }))

import { requestDesktopMode, restoreDesktopSession } from '../session.js'

describe('desktop Bundle recovery', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.appConfig.bundleBackendBaseUrl = 'http://127.0.0.1:30214'
  })

  it('resolves local authentication even while the music folder is unavailable', async () => {
    mocks.desktopCall.mockResolvedValueOnce({
      kind: 'local',
      backend: { error: 'bundle_music_directory_unavailable' },
    })

    expect(await restoreDesktopSession()).toBe(true)
    expect(mocks.setDesktopSessionKind).toHaveBeenCalledWith('local')
    expect(mocks.setAuthState).toHaveBeenCalledWith({
      status: 'unauthenticated',
      isLoading: false,
      error: 'bundle_music_directory_unavailable',
    })
    expect(mocks.appConfig.bundleBackendBaseUrl).toBeNull()
    expect(mocks.getStorage).not.toHaveBeenCalled()
  })

  it('finishes a cancelled replacement folder selection without waiting for login', async () => {
    mocks.desktopCall.mockResolvedValueOnce({
      kind: 'local',
      backend: { state: 'failed' },
    })

    expect(
      await requestDesktopMode('local', { chooseMusicDirectory: true }),
    ).toBe(false)
    expect(mocks.desktopCall).toHaveBeenCalledWith('session.local', {
      chooseMusicDirectory: true,
    })
    expect(mocks.setAuthState).not.toHaveBeenCalled()
  })
})
