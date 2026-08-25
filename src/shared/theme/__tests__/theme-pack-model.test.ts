import { afterEach, describe, expect, test, vi } from 'vitest'

import type { HttpResult } from '../../../core/network/http-client.js'
import {
  activateThemePack,
  applyActiveThemePack,
  clearActiveThemePack,
  getActiveThemePack,
  setActiveThemePack,
  subscribeActiveThemePack,
} from '../theme-pack-model.js'
import type { ThemePackClient } from '../theme-pack-model.js'

/**
 * The model is the app-global "which pack are we wearing" state. What matters
 * is not the HTTP (the shared client is tested elsewhere) but the state
 * transitions around it: fetch applies or resets, activation PUTs *then*
 * re-GETs (the PUT answers a bare success object), and notifications only fire
 * on real changes — the ThemeProvider re-render rides those listeners.
 */

function ok<T>(data: T): Promise<HttpResult<T>> {
  return Promise.resolve({ status: 200, ok: true, data, headers: {} })
}

/** A fake client whose every verb is a spy; per-test via `.mockImplementation`. */
function fakeClient(get = vi.fn(), put = vi.fn(), del = vi.fn()): ThemePackClient {
  return { get, put, delete: del }
}

const SAKURA_ACTIVE = {
  theme_id: 'songloft.sakura',
  data: { id: 'songloft.sakura', name: 'Sakura', seedColor: '#D81B60' },
}

afterEach(() => {
  setActiveThemePack(null)
})

describe('applyActiveThemePack', () => {
  test('applies the server-reported pack', async () => {
    const get = vi.fn(async () => ok(SAKURA_ACTIVE))
    await applyActiveThemePack(fakeClient(get))

    expect(get).toHaveBeenCalledWith('/api/v1/theme-packs/active')
    expect(getActiveThemePack()).toEqual({
      themeId: 'songloft.sakura',
      data: SAKURA_ACTIVE.data,
    })
  })

  test('a body without theme_id means no active pack', async () => {
    await applyActiveThemePack(fakeClient(vi.fn(async () => ok(null))))
    expect(getActiveThemePack()).toBeNull()
  })

  test('a failed fetch falls back to no pack, not a throw', async () => {
    // Startup wiring calls this best-effort; a wedged server must not break boot.
    const get = vi.fn(async () => { throw new Error('boom') })
    setActiveThemePack({ themeId: 'stale', data: {} as never })

    await expect(applyActiveThemePack(fakeClient(get))).resolves.toBeUndefined()
    expect(getActiveThemePack()).toBeNull()
  })
})

describe('activateThemePack', () => {
  test('PUTs the id, then re-GETs the full pack (the PUT answers bare success)', async () => {
    const get = vi.fn(async () => ok(SAKURA_ACTIVE))
    const put = vi.fn(async () => ok({ success: true }))
    await activateThemePack('songloft.sakura', fakeClient(get, put))

    expect(put).toHaveBeenCalledWith('/api/v1/theme-packs/active', { theme_id: 'songloft.sakura' })
    expect(get).toHaveBeenCalledTimes(1)
    expect(getActiveThemePack()?.themeId).toBe('songloft.sakura')
  })

  test('propagates PUT failures without touching live state', async () => {
    setActiveThemePack({ themeId: 'old', data: {} as never })
    const get = vi.fn(async () => ok(SAKURA_ACTIVE))
    const put = vi.fn(async () => { throw new Error('404') })

    await expect(activateThemePack('missing', fakeClient(get, put))).rejects.toThrow('404')
    expect(get).not.toHaveBeenCalled()
    expect(getActiveThemePack()?.themeId).toBe('old')
  })
})

describe('clearActiveThemePack', () => {
  test('DELETEs and resets to the Muse baseline', async () => {
    setActiveThemePack({ themeId: 'old', data: {} as never })
    const del = vi.fn(async () => ok({ success: true }))

    await clearActiveThemePack(fakeClient(vi.fn(), vi.fn(), del))
    expect(del).toHaveBeenCalledWith('/api/v1/theme-packs/active')
    expect(getActiveThemePack()).toBeNull()
  })

  test('keeps the current pack when the DELETE fails', async () => {
    setActiveThemePack({ themeId: 'old', data: {} as never })
    const del = vi.fn(async () => { throw new Error('boom') })

    await expect(clearActiveThemePack(fakeClient(vi.fn(), vi.fn(), del))).rejects.toThrow('boom')
    expect(getActiveThemePack()?.themeId).toBe('old')
  })
})

describe('listener notifications', () => {
  test('setActiveThemePack notifies on change and unsubscribe stops delivery', () => {
    const a = vi.fn()
    const b = vi.fn()
    const offA = subscribeActiveThemePack(a)
    subscribeActiveThemePack(b)

    setActiveThemePack({ themeId: 'x', data: {} as never })
    expect(a).toHaveBeenCalledTimes(1)
    expect(b).toHaveBeenCalledTimes(1)

    offA()
    setActiveThemePack(null)
    expect(a).toHaveBeenCalledTimes(1)
    expect(b).toHaveBeenCalledTimes(2)
  })

  test('setting the identical pack object does not re-notify', () => {
    const pack = { themeId: 'x', data: {} as never }
    const listener = vi.fn()
    subscribeActiveThemePack(listener)

    setActiveThemePack(pack)
    setActiveThemePack(pack)
    expect(listener).toHaveBeenCalledTimes(1)
  })
})
