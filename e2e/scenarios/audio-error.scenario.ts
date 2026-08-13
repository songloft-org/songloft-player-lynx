import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { createDriver, type E2EDriver } from '../driver/index.js'
import { fetchRealSongs } from '../fixtures/songs.js'

/**
 * Verifies the player handles audio errors gracefully — invalid URLs should
 * result in an error state with a user-visible error message, not a crash.
 */
describe('音频：错误处理', () => {
  let driver: E2EDriver

  beforeAll(async () => {
    driver = await createDriver()
    await driver.launch()
    await driver.login('admin', 'admin')
  })

  afterAll(async () => {
    await driver.teardown()
  })

  test('无效 URL → 进入错误状态并显示错误信息', async () => {
    // Load a song with an invalid/unreachable URL
    await driver.evaluateJS(`
      (async () => {
        const store = globalThis.__E2E_PLAYER_STORE__;
        store.getState().reset();
        const badSong = {
          id: 999,
          type: 'local',
          title: 'Bad Song',
          duration: 3,
          url: 'http://localhost:1/nonexistent.mp3',
          year: 0,
          fileSize: 0,
          bitRate: 0,
          sampleRate: 0,
          isLive: false,
          isVideo: false,
          addedAt: '',
          updatedAt: '',
        };
        await store.getState().playSong(badSong);
      })()
    `)

    // Wait for the error state
    await driver.waitFor(
      async () => {
        const s = await driver.getPlayerState()
        return s.state === 'error' || s.errorMessage != null
      },
      { timeout: 10_000 },
    )

    const state = await driver.getPlayerState()
    expect(state.errorMessage).toBeTruthy()
    expect(state.state).toBe('error')
  })

  test('清除错误后状态恢复', async () => {
    await driver.evaluateJS(`
      globalThis.__E2E_PLAYER_STORE__.getState().clearError()
    `)
    await driver.sleep(300)

    const state = await driver.getPlayerState()
    expect(state.errorMessage).toBeUndefined()
  })

  test('错误恢复后可正常播放歌曲', async () => {
    const [song] = await fetchRealSongs(1)
    await driver.evaluateJS(`
      (async () => {
        const store = globalThis.__E2E_PLAYER_STORE__;
        await store.getState().playSong(${JSON.stringify(song)});
      })()
    `)

    await driver.waitFor(
      async () => (await driver.getPlayerState()).state === 'playing',
      { timeout: 8000 },
    )

    const state = await driver.getPlayerState()
    expect(state.state).toBe('playing')
    expect(state.songTitle).toBe(song.title)
    expect(state.errorMessage).toBeUndefined()
  })
})
