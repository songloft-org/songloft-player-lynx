import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

// The host owns TLS trust, so `applyServerSettings` writing `appConfig` is only
// half the job — it has to push the flag down too. Mocked so the assertion is
// about the call, not about a native module that does not exist under vitest.
vi.mock('../../../native/native-platform.js', () => ({
  applyInsecureTls: vi.fn(),
}))

import { appConfig } from '../../../core/config/app-config.js'
import { applyInsecureTls } from '../../../native/native-platform.js'
import { playMode } from '../../../core/config/constants.js'
import { createMemoryStorage } from '../../../core/storage/index.js'
import {
  PREF_INSECURE_TLS,
  PREF_SERVER_URL,
} from '../../auth/store/index.js'
import { coercePlayMode, serverDisplay } from '../domain/settings-model.js'
import {
  applyServerSettings,
  PREF_DEFAULT_PLAY_MODE,
  readDefaultPlayMode,
  writeDefaultPlayMode,
} from '../data/settings-prefs.js'

afterEach(() => appConfig.reset())
beforeEach(() => vi.mocked(applyInsecureTls).mockClear())

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

// The play-mode label/icon key maps are gone with the Settings → Playback section;
// the player's own toggle owns its `player.mode*` maps. `coercePlayMode` stays
// because the `default_play_mode` pref still round-trips (written by PlayControls,
// read at startup in `src/index.tsx`) — see the round-trip test below.

describe('serverDisplay', () => {
  const labels = { embedded: 'Songloft (embedded)', notConfigured: 'Not configured' }
  test('embedded hides the address', () => {
    expect(serverDisplay('http://x', true, labels)).toBe('Songloft (embedded)')
  })
  test('standalone shows the url, or the not-configured label when empty', () => {
    expect(serverDisplay('http://host:58091', false, labels)).toBe('http://host:58091')
    expect(serverDisplay('   ', false, labels)).toBe('Not configured')
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

  // Regression: this used to write `appConfig.insecureTls` and stop there, so a
  // user who enabled the toggle on the Server Settings page kept hitting cert
  // errors — the hosts were never told. Both directions matter: switching back
  // to a public server has to re-tighten trust, not leave it relaxed.
  test('pushes the flag to the host transport, in both directions', async () => {
    const storage = createMemoryStorage()

    await applyServerSettings({ url: 'https://self-signed:58091', insecureTls: true }, storage)
    expect(applyInsecureTls).toHaveBeenCalledWith(true)

    await applyServerSettings({ url: 'https://public:58091', insecureTls: false }, storage)
    expect(applyInsecureTls).toHaveBeenLastCalledWith(false)
    expect(applyInsecureTls).toHaveBeenCalledTimes(2)
  })
})
