import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { createDriver, type E2EDriver } from '../driver/index.js'
import { resetStepCounter, stepScreenshot } from '../driver/step-screenshot.js'
import { fetchRealSongs } from '../fixtures/songs.js'

describe('播放状态持久化', () => {
  let driver: E2EDriver
  let songs: any[]

  beforeAll(async () => {
    resetStepCounter()
    driver = await createDriver()
    await driver.launch()
    await driver.login('admin', 'admin')
    songs = await fetchRealSongs(3)
  })

  afterAll(async () => {
    await driver.teardown()
  })

  test('播放列表加载到 store', async () => {
    await driver.evaluateJS(`
      (async () => {
        const store = globalThis.__E2E_PLAYER_STORE__;
        store.getState().reset();
        await store.getState().playPlaylist(${JSON.stringify(songs)}, 1);
      })()
    `)

    await driver.waitFor(
      async () => (await driver.getPlayerState()).state === 'playing',
      { timeout: 8000 },
    )

    const state = await driver.getPlayerState()
    expect(state.index).toBe(1)
    expect(state.songTitle).toBe(songs[1].title)
    await stepScreenshot(driver, 'persistence-playing')
  })

  test('seek 到特定位置后暂停', async () => {
    await driver.evaluateJS(`
      globalThis.__E2E_PLAYER_STORE__.getState().seek(2000)
    `)
    await driver.sleep(500)

    await driver.tapPlayer('pause')
    await driver.sleep(300)

    const state = await driver.getPlayerState()
    expect(state.state).toBe('paused')
    expect(Math.abs(state.positionMs - 2000)).toBeLessThan(500)
  })

  test('store 状态可序列化', async () => {
    const serializable = await driver.evaluateJS<any>(`
      (() => {
        const state = globalThis.__E2E_PLAYER_STORE__.getState();
        return {
          currentIndex: state.currentIndex,
          playlist: state.playlist?.map(s => ({ id: s.id, title: s.title })),
          playMode: state.playMode,
          speed: state.speed,
          volume: state.volume,
        };
      })()
    `)

    expect(serializable.currentIndex).toBe(1)
    expect(serializable.playlist).toHaveLength(3)
    expect(serializable.playMode).toBeTruthy()
    expect(typeof serializable.speed).toBe('number')
    expect(typeof serializable.volume).toBe('number')
  })

  test('reset 后状态清空', async () => {
    await driver.evaluateJS(`
      globalThis.__E2E_PLAYER_STORE__.getState().reset()
    `)
    await driver.sleep(300)

    const state = await driver.getPlayerState()
    expect(state.state).toBe('idle')
    expect(state.songTitle).toBe('')
    await stepScreenshot(driver, 'persistence-reset')
  })

  test('重新加载播放列表恢复播放', async () => {
    await driver.evaluateJS(`
      (async () => {
        const store = globalThis.__E2E_PLAYER_STORE__;
        await store.getState().playPlaylist(${JSON.stringify(songs)}, 2);
      })()
    `)

    await driver.waitFor(
      async () => (await driver.getPlayerState()).state === 'playing',
      { timeout: 8000 },
    )

    const state = await driver.getPlayerState()
    expect(state.index).toBe(2)
    expect(state.songTitle).toBe(songs[2].title)
  })
})
