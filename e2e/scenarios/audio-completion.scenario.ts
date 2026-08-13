import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { createDriver, type E2EDriver } from '../driver/index.js'
import { fetchRealSongs } from '../fixtures/songs.js'

describe('音频：播放模式与曲末行为', () => {
  let driver: E2EDriver
  let songs: any[]

  beforeAll(async () => {
    driver = await createDriver()
    await driver.launch()
    await driver.login('admin', 'admin')
    songs = await fetchRealSongs(3)
  })

  afterAll(async () => {
    await driver.teardown()
  })

  async function loadPlaylist(startIndex = 0): Promise<void> {
    await driver.evaluateJS(`
      (async () => {
        const store = globalThis.__E2E_PLAYER_STORE__;
        store.getState().reset();
        await store.getState().playPlaylist(${JSON.stringify(songs)}, ${startIndex});
      })()
    `)
    await driver.waitFor(
      async () => (await driver.getPlayerState()).state === 'playing',
      { timeout: 8000 },
    )
  }

  test('顺序模式：自动切换到下一首', async () => {
    await loadPlaylist(1)
    await driver.evaluateJS(`
      globalThis.__E2E_PLAYER_STORE__.getState().setPlayMode('order')
    `)

    // Seek near end to trigger completion quickly
    const durationMs = (await driver.getPlayerState()).durationMs
    await driver.evaluateJS(`
      globalThis.__E2E_PLAYER_STORE__.getState().seek(${Math.max(durationMs - 1500, 0)})
    `)

    await driver.waitFor(
      async () => {
        const s = await driver.getPlayerState()
        return s.index === 2 && s.state === 'playing'
      },
      { timeout: 10000 },
    )

    const state = await driver.getPlayerState()
    expect(state.index).toBe(2)
    expect(state.songTitle).toBe(songs[2].title)
    expect(state.state).toBe('playing')
  })

  test('顺序模式：最后一首播完停止', async () => {
    await loadPlaylist(2)
    await driver.evaluateJS(`
      globalThis.__E2E_PLAYER_STORE__.getState().setPlayMode('order')
    `)

    const durationMs = (await driver.getPlayerState()).durationMs
    await driver.evaluateJS(`
      globalThis.__E2E_PLAYER_STORE__.getState().seek(${Math.max(durationMs - 1500, 0)})
    `)

    await driver.waitFor(
      async () => (await driver.getPlayerState()).state !== 'playing',
      { timeout: 8000 },
    )

    const state = await driver.getPlayerState()
    expect(state.state).not.toBe('playing')
  })

  test('循环模式：最后一首播完回到第一首', async () => {
    await loadPlaylist(2)
    await driver.evaluateJS(`
      globalThis.__E2E_PLAYER_STORE__.getState().setPlayMode('loop')
    `)
    await driver.sleep(500)

    const durationMs = (await driver.getPlayerState()).durationMs
    await driver.evaluateJS(`
      globalThis.__E2E_PLAYER_STORE__.getState().seek(${Math.max(durationMs - 800, 0)})
    `)

    await driver.waitFor(
      async () => {
        const s = await driver.getPlayerState()
        return s.index === 0
      },
      { timeout: 15000 },
    )

    await driver.waitFor(
      async () => (await driver.getPlayerState()).state === 'playing',
      { timeout: 8000 },
    )

    const state = await driver.getPlayerState()
    expect(state.index).toBe(0)
    expect(state.songTitle).toBe(songs[0].title)
    expect(state.state).toBe('playing')
  })

  test('单曲循环：播完后重复当前曲目', async () => {
    await loadPlaylist(1)
    await driver.evaluateJS(`
      globalThis.__E2E_PLAYER_STORE__.getState().setPlayMode('single')
    `)

    const durationMs = (await driver.getPlayerState()).durationMs
    await driver.evaluateJS(`
      globalThis.__E2E_PLAYER_STORE__.getState().seek(${Math.max(durationMs - 1500, 0)})
    `)

    await driver.sleep(3000)
    await driver.waitFor(
      async () => {
        const s = await driver.getPlayerState()
        return s.index === 1 && s.positionMs < 1000 && s.state === 'playing'
      },
      { timeout: 8000 },
    )

    const state = await driver.getPlayerState()
    expect(state.index).toBe(1)
    expect(state.songTitle).toBe(songs[1].title)
    expect(state.state).toBe('playing')
  })
})
