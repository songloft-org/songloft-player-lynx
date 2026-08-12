import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const storageMock = {
  prefs: {
    get: vi.fn(async (_key: string) => null as string | null),
    set: vi.fn(async (_key: string, _value: string) => {}),
    remove: vi.fn(async (_key: string) => {}),
    keys: vi.fn(async () => [] as string[]),
  },
  secure: {
    get: vi.fn(async (_key: string) => null as string | null),
    set: vi.fn(async (_key: string, _value: string) => {}),
    remove: vi.fn(async (_key: string) => {}),
  },
  paths: { appData: vi.fn(), cache: vi.fn(), documents: vi.fn() },
}

vi.mock('../../../core/storage/index.js', () => ({
  getSongloftStorage: () => storageMock,
}))

vi.mock('../../../core/network/token-cache.js', () => ({
  setCachedAccessToken: vi.fn(),
}))

vi.mock('../../../lib/query/index.js', () => ({
  getQueryClient: () => ({ clear: vi.fn() }),
}))

vi.mock('../../../store/index.js', () => ({
  useAppSessionStore: { getState: () => ({ setBaseUrl: vi.fn() }) },
}))

vi.mock('../../../core/config/app-config.js', () => ({
  appConfig: { baseUrl: '', resolvedBaseUrl: '', insecureTls: false },
}))

vi.mock('../../auth/store/index.js', () => ({
  normalizeServerUrl: (url: string) => url.trim().replace(/\/+$/, ''),
  PREF_SERVER_URL: 'server_url',
}))

const { useServerStore } = await import('../store/server-store.js')

beforeEach(() => {
  useServerStore.setState({ profiles: [], activeProfileId: null })
  vi.clearAllMocks()
})

afterEach(() => vi.clearAllMocks())

describe('addProfile', () => {
  test('adds a profile and persists', async () => {
    const profile = await useServerStore.getState().addProfile('Test', 'http://test:8080')
    expect(profile.name).toBe('Test')
    expect(profile.url).toBe('http://test:8080')
    expect(profile.id).toMatch(/^srv_/)
    expect(useServerStore.getState().profiles).toHaveLength(1)
    expect(storageMock.prefs.set).toHaveBeenCalledWith(
      'server_profiles',
      expect.any(String),
    )
  })
})

describe('editProfile', () => {
  test('updates name and url', async () => {
    const profile = await useServerStore.getState().addProfile('Old', 'http://old')
    await useServerStore.getState().editProfile(profile.id, { name: 'New', url: 'http://new' })
    const updated = useServerStore.getState().profiles[0]
    expect(updated.name).toBe('New')
    expect(updated.url).toBe('http://new')
  })
})

describe('removeProfile', () => {
  test('removes profile and cleans up tokens', async () => {
    const profile = await useServerStore.getState().addProfile('Rm', 'http://rm')
    await useServerStore.getState().removeProfile(profile.id)
    expect(useServerStore.getState().profiles).toHaveLength(0)
    expect(storageMock.secure.remove).toHaveBeenCalledWith(`token_access_${profile.id}`)
    expect(storageMock.secure.remove).toHaveBeenCalledWith(`token_refresh_${profile.id}`)
  })
})

describe('switchTo', () => {
  test('saves current tokens and loads target tokens', async () => {
    const p1 = await useServerStore.getState().addProfile('S1', 'http://s1')
    const p2 = await useServerStore.getState().addProfile('S2', 'http://s2')
    useServerStore.setState({ activeProfileId: p1.id })

    // Mock current tokens
    storageMock.secure.get.mockImplementation(async (key: string) => {
      if (key === 'access_token') return 'tok_a'
      if (key === 'refresh_token') return 'tok_r'
      if (key === `token_access_${p2.id}`) return 'tok_a2'
      if (key === `token_refresh_${p2.id}`) return 'tok_r2'
      return null
    })

    const result = await useServerStore.getState().switchTo(p2.id)
    expect(result.hasToken).toBe(true)
    expect(useServerStore.getState().activeProfileId).toBe(p2.id)

    // Saved outgoing tokens
    expect(storageMock.secure.set).toHaveBeenCalledWith(`token_access_${p1.id}`, 'tok_a')
    expect(storageMock.secure.set).toHaveBeenCalledWith(`token_refresh_${p1.id}`, 'tok_r')
    // Loaded incoming tokens
    expect(storageMock.secure.set).toHaveBeenCalledWith('access_token', 'tok_a2')
    expect(storageMock.secure.set).toHaveBeenCalledWith('refresh_token', 'tok_r2')
  })

  test('returns hasToken=false when target has no tokens', async () => {
    const p1 = await useServerStore.getState().addProfile('S1', 'http://s1')
    const p2 = await useServerStore.getState().addProfile('S2', 'http://s2')
    useServerStore.setState({ activeProfileId: p1.id })

    storageMock.secure.get.mockResolvedValue(null)
    const result = await useServerStore.getState().switchTo(p2.id)
    expect(result.hasToken).toBe(false)
  })
})

describe('hydrate', () => {
  test('loads profiles from storage', async () => {
    const stored = JSON.stringify([
      { id: 'srv_x', name: 'X', url: 'http://x', insecure_tls: false },
    ])
    storageMock.prefs.get.mockImplementation(async (key: string) => {
      if (key === 'server_profiles') return stored
      if (key === 'server_active_profile') return 'srv_x'
      return null
    })

    await useServerStore.getState().hydrate()
    expect(useServerStore.getState().profiles).toHaveLength(1)
    expect(useServerStore.getState().profiles[0].name).toBe('X')
    expect(useServerStore.getState().activeProfileId).toBe('srv_x')
  })

  test('migrates from legacy server_url when no profiles exist', async () => {
    storageMock.prefs.get.mockImplementation(async (key: string) => {
      if (key === 'server_url') return 'http://legacy:8080'
      return null
    })

    await useServerStore.getState().hydrate()
    expect(useServerStore.getState().profiles).toHaveLength(1)
    expect(useServerStore.getState().profiles[0].url).toBe('http://legacy:8080')
    expect(useServerStore.getState().profiles[0].name).toBe('Default')
    expect(useServerStore.getState().activeProfileId).not.toBeNull()
  })
})
