import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { createDriver, type E2EDriver } from '../driver/index.js'
import { fetchRealSongs } from '../fixtures/songs.js'

describe('音频：播放速度', () => {
  let driver: E2EDriver

  /**
   * Advancement of the store's position over ~2 real seconds.
   *
   * The position only moves when a host progress event lands, and both hosts tick on
   * a 500 ms wall-clock cadence, so each step is `500 × rate` ms and the count of
   * steps inside the window is off by one depending on where the window falls
   * relative to the tick phase. A 1-second window makes that off-by-one worth 50% of
   * the reading — which is exactly how the 0.5× case used to fail (it caught either
   * zero steps or one). Two seconds keeps one stray tick inside the tolerance band.
   */
  async function measureAdvancement(): Promise<number> {
    const start = (await driver.getPlayerState()).positionMs
    await driver.sleep(2000)
    const end = (await driver.getPlayerState()).positionMs
    return end - start
  }

  beforeAll(async () => {
    driver = await createDriver()
    await driver.launch()
    await driver.login('admin', 'admin')

    const [song] = await fetchRealSongs(1)
    await driver.evaluateJS(`
      (async () => {
        const store = globalThis.__E2E_PLAYER_STORE__;
        store.getState().reset();
        await store.getState().playSong(${JSON.stringify(song)});
      })()
    `)
    await driver.waitFor(
      async () => (await driver.getPlayerState()).state === 'playing',
      { timeout: 8000 },
    )
  })

  afterAll(async () => {
    await driver.teardown()
  })

  test('默认播放速度为 1x', async () => {
    const state = await driver.getPlayerState()
    expect(state.speed).toBe(1)
  })

  test('设置 2 倍速后状态更新', async () => {
    await driver.evaluateJS(`
      globalThis.__E2E_PLAYER_STORE__.getState().setSpeed(2)
    `)
    await driver.sleep(300)

    const state = await driver.getPlayerState()
    expect(state.speed).toBe(2)
  })

  test('2 倍速下进度推进更快', async () => {
    // Reset position and measure advancement at 2x
    await driver.evaluateJS(`
      globalThis.__E2E_PLAYER_STORE__.getState().seek(0)
    `)
    await driver.sleep(200)

    const advancement = await measureAdvancement()
    // At 2x over ~2 real seconds the position should advance ~4000ms. The band has
    // to absorb one whole tick of quantisation (see [measureAdvancement]), which at
    // 2x is 1000ms; 1x would land at ~2000ms, well outside.
    expect(advancement).toBeGreaterThan(3000)
    expect(advancement).toBeLessThan(5600)
  })

  test('0.5 倍速下进度推进变慢', async () => {
    await driver.evaluateJS(`
      globalThis.__E2E_PLAYER_STORE__.getState().setSpeed(0.5)
    `)
    await driver.sleep(200)

    await driver.evaluateJS(`
      globalThis.__E2E_PLAYER_STORE__.getState().seek(0)
    `)
    await driver.sleep(200)

    const advancement = await measureAdvancement()
    // At 0.5x over ~2 real seconds the position should advance ~1000ms. 1x would
    // land at ~2000ms, outside the band.
    expect(advancement).toBeGreaterThan(700)
    expect(advancement).toBeLessThan(1600)
  })

  test('速度被限制在 [0.25, 3] 范围内', async () => {
    await driver.evaluateJS(`
      globalThis.__E2E_PLAYER_STORE__.getState().setSpeed(5)
    `)
    await driver.sleep(200)
    expect((await driver.getPlayerState()).speed).toBe(3)

    await driver.evaluateJS(`
      globalThis.__E2E_PLAYER_STORE__.getState().setSpeed(0.1)
    `)
    await driver.sleep(200)
    expect((await driver.getPlayerState()).speed).toBe(0.25)
  })

  test('恢复为 1 倍速', async () => {
    await driver.evaluateJS(`
      globalThis.__E2E_PLAYER_STORE__.getState().setSpeed(1)
    `)
    await driver.sleep(200)
    expect((await driver.getPlayerState()).speed).toBe(1)
  })
})
