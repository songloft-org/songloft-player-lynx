import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { createDriver, type E2EDriver } from '../driver/index.js'
import { fetchRealSongs } from '../fixtures/songs.js'

describe('音频：播放速度', () => {
  let driver: E2EDriver

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

    const start = (await driver.getPlayerState()).positionMs
    await driver.sleep(1000)
    const end = (await driver.getPlayerState()).positionMs

    const advancement = end - start
    // At 2x speed over 1 real second, should advance ~2000ms (with tolerance)
    expect(advancement).toBeGreaterThan(1500)
    expect(advancement).toBeLessThan(2800)
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

    const start = (await driver.getPlayerState()).positionMs
    await driver.sleep(1000)
    const end = (await driver.getPlayerState()).positionMs

    const advancement = end - start
    // At 0.5x speed over 1 real second, should advance ~500ms (with tolerance)
    expect(advancement).toBeGreaterThan(300)
    expect(advancement).toBeLessThan(900)
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
