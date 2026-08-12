import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const audioMock = {
  setEqualizerEnabled: vi.fn(async () => {}),
  setEqualizerBand: vi.fn(async () => {}),
  getEqualizerBands: vi.fn(async () => []),
}

const storageMock = {
  prefs: {
    get: vi.fn(async (_key: string) => null as string | null),
    set: vi.fn(async (_key: string, _value: string) => {}),
    remove: vi.fn(async (_key: string) => {}),
    keys: vi.fn(async () => [] as string[]),
  },
  secure: { get: vi.fn(), set: vi.fn(), remove: vi.fn() },
  paths: { appData: vi.fn(), cache: vi.fn(), documents: vi.fn() },
}

vi.mock('../../../native/audio-facade.js', () => ({
  getAudio: () => audioMock,
}))

vi.mock('../../../core/storage/index.js', () => ({
  getSongloftStorage: () => storageMock,
}))

const { useEqStore } = await import('../store/eq-store.js')

beforeEach(() => {
  useEqStore.setState({
    enabled: false,
    bands: Array.from({ length: 10 }, () => 0),
    activePreset: 'flat',
  })
})

afterEach(() => vi.clearAllMocks())

describe('toggle', () => {
  test('toggles enabled state and calls audio', () => {
    useEqStore.getState().toggle()
    expect(useEqStore.getState().enabled).toBe(true)
    expect(audioMock.setEqualizerEnabled).toHaveBeenCalledWith(true)

    useEqStore.getState().toggle()
    expect(useEqStore.getState().enabled).toBe(false)
    expect(audioMock.setEqualizerEnabled).toHaveBeenCalledWith(false)
  })

  test('persists to storage', () => {
    useEqStore.getState().toggle()
    expect(storageMock.prefs.set).toHaveBeenCalledWith('eq_enabled', 'true')
  })
})

describe('selectPreset', () => {
  test('applies preset bands and updates activePreset', () => {
    useEqStore.getState().selectPreset('rock')
    const state = useEqStore.getState()
    expect(state.activePreset).toBe('rock')
    expect(state.bands[0]).toBe(5)
    expect(state.bands).toHaveLength(10)
  })

  test('syncs all bands to audio when enabled', () => {
    useEqStore.setState({ enabled: true })
    useEqStore.getState().selectPreset('pop')
    expect(audioMock.setEqualizerEnabled).toHaveBeenCalledWith(true)
    expect(audioMock.setEqualizerBand).toHaveBeenCalledTimes(10)
  })
})

describe('adjustBand', () => {
  test('updates a single band and sets preset to custom', () => {
    useEqStore.getState().adjustBand(2, 6)
    const state = useEqStore.getState()
    expect(state.bands[2]).toBe(6)
    expect(state.activePreset).toBe('custom')
  })

  test('clamps out-of-range gain', () => {
    useEqStore.getState().adjustBand(0, 20)
    expect(useEqStore.getState().bands[0]).toBe(12)

    useEqStore.getState().adjustBand(0, -20)
    expect(useEqStore.getState().bands[0]).toBe(-12)
  })

  test('calls audio.setEqualizerBand when enabled', () => {
    useEqStore.setState({ enabled: true })
    useEqStore.getState().adjustBand(3, 4)
    expect(audioMock.setEqualizerBand).toHaveBeenCalledWith(3, 4)
  })

  test('does not call audio.setEqualizerBand when disabled', () => {
    useEqStore.getState().adjustBand(3, 4)
    expect(audioMock.setEqualizerBand).not.toHaveBeenCalled()
  })
})

describe('reset', () => {
  test('resets to flat preset and disables', () => {
    useEqStore.setState({ enabled: true, bands: [5, 4, 3, 1, -1, -1, 0, 2, 3, 4], activePreset: 'rock' })
    useEqStore.getState().reset()
    const state = useEqStore.getState()
    expect(state.enabled).toBe(false)
    expect(state.activePreset).toBe('flat')
    expect(state.bands.every((g) => g === 0)).toBe(true)
  })
})

describe('hydrate', () => {
  test('reads from storage and syncs to audio', async () => {
    storageMock.prefs.get.mockImplementation(async (key: string) => {
      if (key === 'eq_enabled') return 'true'
      if (key === 'eq_bands') return JSON.stringify([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
      if (key === 'eq_preset') return 'custom'
      return null
    })

    await useEqStore.getState().hydrate()
    const state = useEqStore.getState()
    expect(state.enabled).toBe(true)
    expect(state.bands).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    expect(state.activePreset).toBe('custom')
    expect(audioMock.setEqualizerEnabled).toHaveBeenCalledWith(true)
    expect(audioMock.setEqualizerBand).toHaveBeenCalledTimes(10)
  })

  test('falls back to defaults when storage is empty', async () => {
    storageMock.prefs.get.mockResolvedValue(null)
    await useEqStore.getState().hydrate()
    const state = useEqStore.getState()
    expect(state.enabled).toBe(false)
    expect(state.activePreset).toBe('flat')
    expect(state.bands.every((g) => g === 0)).toBe(true)
  })

  test('clamps out-of-range values from storage', async () => {
    storageMock.prefs.get.mockImplementation(async (key: string) => {
      if (key === 'eq_bands') return JSON.stringify([20, -20, 0, 0, 0, 0, 0, 0, 0, 0])
      return null
    })
    await useEqStore.getState().hydrate()
    expect(useEqStore.getState().bands[0]).toBe(12)
    expect(useEqStore.getState().bands[1]).toBe(-12)
  })
})
