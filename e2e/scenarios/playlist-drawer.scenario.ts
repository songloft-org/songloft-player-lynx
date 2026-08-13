import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { createDriver, type E2EDriver } from '../driver/index.js'
import { resetStepCounter, stepScreenshot } from '../driver/step-screenshot.js'
import { fetchRealSongs } from '../fixtures/songs.js'

describe('播放队列抽屉', () => {
  let driver: E2EDriver
  let songs: any[]

  beforeAll(async () => {
    resetStepCounter()
    driver = await createDriver()
    await driver.launch()
    await driver.login('admin', 'admin')

    songs = await fetchRealSongs(4)
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

    await driver.evaluateJS(`
      globalThis.__E2E_ROUTER__?.navigate({ to: '/player' })
    `)
    await driver.sleep(500)
  })

  afterAll(async () => {
    await driver.teardown()
  })

  test('队列包含所有歌曲', async () => {
    const queueLength = await driver.evaluateJS<number>(`
      globalThis.__E2E_PLAYER_STORE__.getState().playlist?.length ?? 0
    `)
    expect(queueLength).toBe(songs.length)
  })

  test('队列内容与 playlist 一致', async () => {
    const queueTitles = await driver.evaluateJS<string[]>(`
      (globalThis.__E2E_PLAYER_STORE__.getState().playlist ?? []).map(s => s.title)
    `)
    expect(queueTitles).toEqual(songs.map(s => s.title))
    await stepScreenshot(driver, 'queue-contents')
  })

  test('切换歌曲后 currentIndex 更新', async () => {
    await driver.tapPlayer('next')
    await driver.waitFor(
      async () => (await driver.getPlayerState()).index === 1,
      { timeout: 5000 },
    )

    const state = await driver.getPlayerState()
    expect(state.index).toBe(1)
    expect(state.songTitle).toBe(songs[1].title)
  })

  test('清空播放列表', async () => {
    const hasClear = await driver.evaluateJS<boolean>(`
      typeof globalThis.__E2E_PLAYER_STORE__.getState().clearPlaylist === 'function'
    `)

    if (hasClear) {
      await driver.evaluateJS(`
        globalThis.__E2E_PLAYER_STORE__.getState().clearPlaylist()
      `)
      await driver.sleep(300)

      const queueLength = await driver.evaluateJS<number>(`
        globalThis.__E2E_PLAYER_STORE__.getState().playlist?.length ?? 0
      `)
      expect(queueLength).toBe(0)
    } else {
      // Use reset as fallback
      await driver.evaluateJS(`
        globalThis.__E2E_PLAYER_STORE__.getState().reset()
      `)
      await driver.sleep(300)
      const state = await driver.getPlayerState()
      expect(state.state).toBe('idle')
    }
    await stepScreenshot(driver, 'queue-cleared')
  })
})
