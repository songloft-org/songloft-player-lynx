import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { createDriver, type E2EDriver } from '../driver/index.js'
import { fetchRealSongs } from '../fixtures/songs.js'

describe('音频：队列切歌（上一首/下一首）', () => {
  let driver: E2EDriver
  let songs: any[]

  beforeAll(async () => {
    driver = await createDriver()
    await driver.launch()
    await driver.login('admin', 'admin')

    songs = await fetchRealSongs(3)
    await driver.evaluateJS(`
      (async () => {
        const store = globalThis.__E2E_PLAYER_STORE__;
        await store.getState().playPlaylist(${JSON.stringify(songs)}, 0);
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

  test('下一首切换到第二首歌', async () => {
    await driver.tapPlayer('next')

    await driver.waitFor(
      async () => (await driver.getPlayerState()).index === 1,
      { timeout: 5000 },
    )

    const state = await driver.getPlayerState()
    expect(state.index).toBe(1)
    expect(state.songTitle).toBe(songs[1].title)
    expect(state.state).toBe('playing')
  })

  test('再次下一首切换到第三首歌', async () => {
    await driver.tapPlayer('next')

    await driver.waitFor(
      async () => (await driver.getPlayerState()).index === 2,
      { timeout: 5000 },
    )

    const state = await driver.getPlayerState()
    expect(state.index).toBe(2)
    expect(state.songTitle).toBe(songs[2].title)
  })

  test('播放前3秒内按上一首，回退到上一首歌', async () => {
    await driver.evaluateJS(`
      globalThis.__E2E_PLAYER_STORE__.getState().seek(0)
    `)
    await driver.sleep(300)

    await driver.tapPlayer('prev')

    await driver.waitFor(
      async () => (await driver.getPlayerState()).index === 1,
      { timeout: 5000 },
    )

    const state = await driver.getPlayerState()
    expect(state.index).toBe(1)
    expect(state.songTitle).toBe(songs[1].title)
  })

  test('播放超过3秒后按上一首，重新播放当前曲目', async () => {
    await driver.evaluateJS(`
      globalThis.__E2E_PLAYER_STORE__.getState().seek(3500)
    `)
    await driver.sleep(300)

    await driver.tapPlayer('prev')
    await driver.sleep(500)

    const state = await driver.getPlayerState()
    expect(state.index).toBe(1)
    expect(state.positionMs).toBeLessThan(1000)
  })
})
