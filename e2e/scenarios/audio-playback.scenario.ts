import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { createDriver, type E2EDriver } from '../driver/index.js'
import { resetStepCounter, stepScreenshot } from '../driver/step-screenshot.js'
import { fetchRealSongs } from '../fixtures/songs.js'

describe('音频：基础播放', () => {
  let driver: E2EDriver

  beforeAll(async () => {
    resetStepCounter()
    driver = await createDriver()
    await driver.launch()
    await driver.login('admin', 'admin')
    await stepScreenshot(driver, 'logged-in-ready')
  })

  afterAll(async () => {
    await driver.teardown()
  })

  test('播放歌曲 → 状态切换为 playing', async () => {
    const [song] = await fetchRealSongs(1)

    await driver.evaluateJS(`
      (async () => {
        const store = globalThis.__E2E_PLAYER_STORE__;
        await store.getState().playSong(${JSON.stringify(song)});
      })()
    `)

    await driver.waitFor(
      async () => (await driver.getPlayerState()).state === 'playing',
      { timeout: 10000 },
    )

    const state = await driver.getPlayerState()
    expect(state.state).toBe('playing')
    expect(state.durationMs).toBeGreaterThan(0)
    expect(state.songTitle).toBeTruthy()

    await stepScreenshot(driver, 'playing-state')
  })

  test('暂停后进度不再推进', async () => {
    await driver.tapPlayer('pause')
    await driver.sleep(300)

    const stateAfterPause = await driver.getPlayerState()
    expect(stateAfterPause.state).toBe('paused')
    await stepScreenshot(driver, 'paused-state')

    const pos1 = stateAfterPause.positionMs
    await driver.sleep(1000)
    const pos2 = (await driver.getPlayerState()).positionMs

    // Position should not advance while paused
    expect(Math.abs(pos2 - pos1)).toBeLessThan(100)
  })

  test('恢复播放后从暂停位置继续', async () => {
    const posBeforeResume = (await driver.getPlayerState()).positionMs

    await driver.tapPlayer('play')
    await driver.waitFor(
      async () => (await driver.getPlayerState()).state === 'playing',
      { timeout: 5000 },
    )

    await driver.sleep(1500)
    const posAfterResume = (await driver.getPlayerState()).positionMs

    // Position should have advanced
    expect(posAfterResume).toBeGreaterThan(posBeforeResume)
    await stepScreenshot(driver, 'resumed-playing')
  })

  test('拖动进度条跳转到指定位置', async () => {
    // Deliberately *behind* the current position (~3s by now), so a seek that
    // silently did nothing lands far above the band asserted below.
    const targetMs = 1500
    const t0 = Date.now()
    await driver.evaluateJS(`
      globalThis.__E2E_PLAYER_STORE__.getState().seek(${targetMs})
    `)
    await driver.sleep(500)
    const state = await driver.getPlayerState()
    const elapsed = Date.now() - t0

    // Playback keeps running while we wait, so the landing point is `target` plus up
    // to `elapsed` of real time, quantised to the host's 500ms progress tick — hence
    // one whole tick of slack on each side. A fixed ±500ms window around `target`
    // reads tighter but is only ever satisfied by luck: at 1x the single tick during
    // the 500ms wait lands exactly on the boundary (measured 500.2 against a budget
    // of 500), leaving nothing for the seek imprecision it was meant to cover.
    expect(state.positionMs).toBeGreaterThan(targetMs - 600)
    expect(state.positionMs).toBeLessThan(targetMs + elapsed + 600)
    await stepScreenshot(driver, 'after-seek')
  })
})
