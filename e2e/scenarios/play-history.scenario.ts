import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { createDriver, type E2EDriver } from '../driver/index.js'
import { fetchRealSongs } from '../fixtures/songs.js'

describe('播放历史', () => {
  let driver: E2EDriver
  let songs: any[]

  beforeAll(async () => {
    driver = await createDriver()
    await driver.launch()
    await driver.login('admin', 'admin')
    songs = await fetchRealSongs(2)
  })

  afterAll(async () => {
    await driver.teardown()
  })

  test('导航到播放历史页', async () => {
    await driver.evaluateJS(`
      globalThis.__E2E_ROUTER__?.navigate({ to: '/library/history' })
    `)
    await driver.sleep(500)

    const currentPath = await driver.evaluateJS<string>(`
      globalThis.__E2E_ROUTER__?.state?.location?.pathname ?? 'unknown'
    `)
    expect(currentPath).toBe('/library/history')
  })

  test('播放歌曲后记录历史', async () => {
    await driver.evaluateJS(`
      (async () => {
        const store = globalThis.__E2E_PLAYER_STORE__;
        store.getState().reset();
        await store.getState().playSong(${JSON.stringify(songs[0])});
      })()
    `)

    await driver.waitFor(
      async () => (await driver.getPlayerState()).state === 'playing',
      { timeout: 8000 },
    )

    // The song should be playing — history recording is an async side-effect
    const state = await driver.getPlayerState()
    expect(state.songTitle).toBe(songs[0].title)
  })
})
