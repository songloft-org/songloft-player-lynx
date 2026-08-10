import { afterEach, describe, expect, test } from 'vitest'

import { appConfig } from '../../../core/config/app-config.js'
import { playMode } from '../../../core/config/constants.js'
import { createMemoryStorage } from '../../../core/storage/index.js'
import {
  PREF_INSECURE_TLS,
  PREF_SERVER_URL,
} from '../../auth/store/index.js'
import {
  coercePlayMode,
  playModeIcon,
  playModeLabel,
  serverDisplay,
} from '../domain/settings-model.js'
import {
  applyServerSettings,
  PREF_DEFAULT_PLAY_MODE,
  readDefaultPlayMode,
  writeDefaultPlayMode,
} from '../data/settings-prefs.js'

afterEach(() => appConfig.reset())

describe('coercePlayMode', () => {
  test('passes through the four valid modes', () => {
    expect(coercePlayMode('order')).toBe(playMode.order)
    expect(coercePlayMode('loop')).toBe(playMode.loop)
    expect(coercePlayMode('single')).toBe(playMode.single)
    expect(coercePlayMode('random')).toBe(playMode.random)
  })

  test('falls back to order for null / unknown (never throws)', () => {
    expect(coercePlayMode(null)).toBe(playMode.order)
    expect(coercePlayMode(undefined)).toBe(playMode.order)
    expect(coercePlayMode('')).toBe(playMode.order)
    expect(coercePlayMode('bogus')).toBe(playMode.order)
  })
})

describe('play mode presentation', () => {
  test('label + icon per mode', () => {
    expect(playModeLabel('order')).toBe('Play in order')
    expect(playModeLabel('random')).toBe('Shuffle')
    expect(playModeIcon('loop')).toBe('repeat')
    expect(playModeIcon('single')).toBe('repeat-one')
    expect(playModeIcon('random')).toBe('shuffle')
  })
})

describe('serverDisplay', () => {
  test('embedded hides the address', () => {
    expect(serverDisplay('http://x', true)).toBe('Songloft (embedded)')
  })
  test('standalone shows the url, or Not configured when empty', () => {
    expect(serverDisplay('http://host:58091', false)).toBe('http://host:58091')
    expect(serverDisplay('   ', false)).toBe('Not configured')
  })
})

describe('default play mode prefs round-trip', () => {
  test('reads order by default, then reflects a written value', async () => {
    const storage = createMemoryStorage()
    expect(await readDefaultPlayMode(storage)).toBe(playMode.order)
    await writeDefaultPlayMode(playMode.random, storage)
    expect(await storage.prefs.get(PREF_DEFAULT_PLAY_MODE)).toBe('random')
    expect(await readDefaultPlayMode(storage)).toBe(playMode.random)
  })

  test('a corrupt persisted value coerces back to order', async () => {
    const storage = createMemoryStorage()
    await storage.prefs.set(PREF_DEFAULT_PLAY_MODE, 'garbage')
    expect(await readDefaultPlayMode(storage)).toBe(playMode.order)
  })
})

describe('applyServerSettings', () => {
  test('normalizes the url, mutates appConfig, and persists both prefs', async () => {
    const storage = createMemoryStorage()
    const normalized = await applyServerSettings(
      { url: '  http://host:58091///  ', insecureTls: true },
      storage,
    )

    expect(normalized).toBe('http://host:58091')
    expect(appConfig.baseUrl).toBe('http://host:58091')
    expect(appConfig.resolvedBaseUrl).toBe('http://host:58091')
    expect(appConfig.insecureTls).toBe(true)
    expect(await storage.prefs.get(PREF_SERVER_URL)).toBe('http://host:58091')
    expect(await storage.prefs.get(PREF_INSECURE_TLS)).toBe('true')
  })

  test('the applied base URL is what the http layer reads (immediate effect)', async () => {
    const storage = createMemoryStorage()
    await applyServerSettings({ url: 'http://new:9000', insecureTls: false }, storage)
    // `HttpClient` defaults its base to `appConfig.resolvedBaseUrl` live per
    // request, so a switch here changes subsequent requests without a rebuild.
    expect(appConfig.resolvedBaseUrl).toBe('http://new:9000')
    expect(appConfig.insecureTls).toBe(false)
  })
})
