import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { createDriver, type E2EDriver } from '../driver/index.js'
import { resetStepCounter, stepScreenshot } from '../driver/step-screenshot.js'
import { getToken } from '../fixtures/songs.js'

/**
 * On-device song cache. Needs the native `SongloftSongCache` module, so it is
 * skipped where the capability is absent (e.g. a Web host). On a device it caches a
 * real song, asserts the facade reports a playable `file://` URL, then removes it and
 * asserts it is gone — the whole round trip the player relies on for offline replay.
 */
describe('本机歌曲缓存', () => {
  let driver: E2EDriver
  let capable = false
  // A song with a playable url, in the shape the bridge's cache actions consume.
  let song: Record<string, unknown> | null = null

  beforeAll(async () => {
    resetStepCounter()
    driver = await createDriver()
    await driver.launch()
    await driver.login('admin', 'admin')

    capable = await driver.evaluateJS<boolean>(`globalThis.__E2E_SONG_CACHE__?.capable()`)

    if (capable) {
      const token = await getToken()
      const res = await fetch('http://localhost:58091/api/v1/songs?limit=20', {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = (await res.json()) as { songs?: Record<string, unknown>[] }
      // Pick the first song that actually has a playable url to cache.
      song = (data.songs ?? []).find((s) => typeof s.url === 'string' && s.url.length > 0) ?? null
    }
  })

  afterAll(async () => {
    await driver.teardown()
  })

  test('宿主具备缓存能力（原生模块在位）', async () => {
    // On a device this is true; the rest of the suite is skipped when it is not.
    expect(typeof capable).toBe('boolean')
    if (!capable) return
    expect(capable).toBe(true)
  })

  test('缓存一首歌后 getCacheInfo 返回 file:// 地址', async () => {
    if (!capable || !song) return
    const songJson = JSON.stringify(song)

    const outcome = await driver.evaluateJS<string>(
      `globalThis.__E2E_SONG_CACHE__?.cache(${JSON.stringify(songJson)})`,
    )
    // The cap pre-check and the native download both succeeded.
    expect(outcome).toBe('cached')

    const info = await driver.evaluateJS<{ cached: boolean; url?: string }>(
      `globalThis.__E2E_SONG_CACHE__?.info(${song.id})`,
    )
    expect(info.cached).toBe(true)
    expect(info.url?.startsWith('file://')).toBe(true)
    await stepScreenshot(driver, 'song-cache-cached')
  })

  test('删除后不再报告为已缓存', async () => {
    if (!capable || !song) return
    const songJson = JSON.stringify(song)

    const outcome = await driver.evaluateJS<string>(
      `globalThis.__E2E_SONG_CACHE__?.remove(${JSON.stringify(songJson)})`,
    )
    expect(outcome).toBe('removed')

    const info = await driver.evaluateJS<{ cached: boolean }>(
      `globalThis.__E2E_SONG_CACHE__?.info(${song.id})`,
    )
    expect(info.cached).toBe(false)
  })
})
