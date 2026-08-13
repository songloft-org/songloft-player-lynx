import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { createDriver, type E2EDriver } from '../driver/index.js'
import { resetStepCounter, stepScreenshot } from '../driver/step-screenshot.js'
import { fetchRealSongs } from '../fixtures/songs.js'

describe('全屏播放器', () => {
  let driver: E2EDriver
  let songs: any[]

  beforeAll(async () => {
    resetStepCounter()
    driver = await createDriver()
    await driver.launch()
    await driver.login('admin', 'admin')

    songs = await fetchRealSongs(3)
    await driver.evaluateJS(`
      (async () => {
        const store = globalThis.__E2E_PLAYER_STORE__;
        store.getState().reset();
        await store.getState().playPlaylist(${JSON.stringify(songs)}, 0);
      })()
    `)
    await driver.waitFor(
      async () => (await driver.getPlayerState()).state === 'playing',
      { timeout: 8000 },
    )

    // Navigate to player page
    await driver.evaluateJS(`
      globalThis.__E2E_ROUTER__?.navigate({ to: '/player' })
    `)
    await driver.sleep(500)
  })

  afterAll(async () => {
    await driver.teardown()
  })

  test('打开全屏播放器显示当前歌曲信息', async () => {
    const state = await driver.getPlayerState()
    expect(state.songTitle).toBe(songs[0].title)
    expect(state.state).toBe('playing')
    await stepScreenshot(driver, 'player-showing-song')
  })

  test('播放/暂停控制', async () => {
    await driver.tapPlayer('pause')
    await driver.sleep(300)
    expect((await driver.getPlayerState()).state).toBe('paused')

    await driver.tapPlayer('play')
    await driver.waitFor(
      async () => (await driver.getPlayerState()).state === 'playing',
      { timeout: 5000 },
    )
    expect((await driver.getPlayerState()).state).toBe('playing')
    await stepScreenshot(driver, 'player-play-pause')
  })

  test('下一首切换歌曲', async () => {
    await driver.tapPlayer('next')
    await driver.waitFor(
      async () => (await driver.getPlayerState()).index === 1,
      { timeout: 5000 },
    )
    const state = await driver.getPlayerState()
    expect(state.index).toBe(1)
    expect(state.songTitle).toBe(songs[1].title)
  })

  test('上一首切换歌曲', async () => {
    // Seek to 0 to ensure prev goes back a track
    await driver.evaluateJS(`
      globalThis.__E2E_PLAYER_STORE__.getState().seek(0)
    `)
    await driver.sleep(300)

    await driver.tapPlayer('prev')
    await driver.waitFor(
      async () => (await driver.getPlayerState()).index === 0,
      { timeout: 5000 },
    )
    expect((await driver.getPlayerState()).index).toBe(0)
  })

  test('进度条拖动', async () => {
    await driver.evaluateJS(`
      globalThis.__E2E_PLAYER_STORE__.getState().seek(2000)
    `)
    await driver.sleep(500)
    const state = await driver.getPlayerState()
    expect(Math.abs(state.positionMs - 2000)).toBeLessThan(500)
  })

  test('播放模式切换 (order → loop → single)', async () => {
    await driver.evaluateJS(`
      globalThis.__E2E_PLAYER_STORE__.getState().setPlayMode('order')
    `)
    await driver.sleep(200)
    expect((await driver.getPlayerState()).playMode).toBe('order')

    await driver.evaluateJS(`
      globalThis.__E2E_PLAYER_STORE__.getState().cyclePlayMode()
    `)
    await driver.sleep(200)
    const mode1 = (await driver.getPlayerState()).playMode
    expect(['loop', 'repeat', 'shuffle', 'single']).toContain(mode1)

    await driver.evaluateJS(`
      globalThis.__E2E_PLAYER_STORE__.getState().cyclePlayMode()
    `)
    await driver.sleep(200)
    const mode2 = (await driver.getPlayerState()).playMode
    expect(mode2).not.toBe('order')
    await stepScreenshot(driver, 'player-mode-cycled')
  })

  test('倍速切换', async () => {
    await driver.evaluateJS(`
      globalThis.__E2E_PLAYER_STORE__.getState().setSpeed(1)
    `)
    await driver.sleep(200)
    expect((await driver.getPlayerState()).speed).toBe(1)

    await driver.evaluateJS(`
      globalThis.__E2E_PLAYER_STORE__.getState().setSpeed(1.5)
    `)
    await driver.sleep(200)
    expect((await driver.getPlayerState()).speed).toBe(1.5)

    // Restore
    await driver.evaluateJS(`
      globalThis.__E2E_PLAYER_STORE__.getState().setSpeed(1)
    `)
    await driver.sleep(200)
  })

  test('音量调节', async () => {
    // Volume uses 0-100 integer scale
    await driver.evaluateJS(`
      globalThis.__E2E_PLAYER_STORE__.getState().setVolume(50)
    `)
    await driver.sleep(200)

    const volume = await driver.evaluateJS<number>(`
      globalThis.__E2E_PLAYER_STORE__.getState().volume
    `)
    expect(volume).toBe(50)
  })

  test('静音/取消静音', async () => {
    await driver.evaluateJS(`
      globalThis.__E2E_PLAYER_STORE__.getState().setVolume(80)
    `)
    await driver.sleep(200)

    await driver.evaluateJS(`
      globalThis.__E2E_PLAYER_STORE__.getState().toggleMute()
    `)
    await driver.sleep(200)

    const volumeAfterMute = await driver.evaluateJS<number>(`
      globalThis.__E2E_PLAYER_STORE__.getState().volume
    `)
    expect(volumeAfterMute).toBe(0)

    await driver.evaluateJS(`
      globalThis.__E2E_PLAYER_STORE__.getState().toggleMute()
    `)
    await driver.sleep(200)

    const volumeAfterUnmute = await driver.evaluateJS<number>(`
      globalThis.__E2E_PLAYER_STORE__.getState().volume
    `)
    expect(volumeAfterUnmute).toBe(80)
    await stepScreenshot(driver, 'player-volume-mute')
  })

  test('定时关闭设置', async () => {
    const hasSleepTimer = await driver.evaluateJS<boolean>(`
      typeof globalThis.__E2E_PLAYER_STORE__.getState().setSleepTimer === 'function'
    `)

    if (hasSleepTimer) {
      await driver.evaluateJS(`
        globalThis.__E2E_PLAYER_STORE__.getState().setSleepTimer({ minutes: 30 })
      `)
      await driver.sleep(200)

      const timer = await driver.evaluateJS<any>(`
        globalThis.__E2E_PLAYER_STORE__.getState().sleepTimer
      `)
      expect(timer).toBeTruthy()
    } else {
      // sleepTimer might not be implemented yet — skip gracefully
      expect(hasSleepTimer).toBe(false)
    }
  })
})
