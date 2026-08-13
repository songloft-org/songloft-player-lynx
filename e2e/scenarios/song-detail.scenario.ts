import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { createDriver, type E2EDriver } from '../driver/index.js'
import { fetchRealSongs, getToken } from '../fixtures/songs.js'

describe('歌曲详情', () => {
  let driver: E2EDriver
  let songs: any[]
  let token: string

  beforeAll(async () => {
    driver = await createDriver()
    await driver.launch()
    await driver.login('admin', 'admin')
    songs = await fetchRealSongs(1)
    token = await getToken()
  })

  afterAll(async () => {
    await driver.teardown()
  })

  test('导航到歌曲详情页', async () => {
    const songId = songs[0].id
    await driver.evaluateJS(`
      globalThis.__E2E_ROUTER__?.navigate({ to: '/library/song/${songId}' })
    `)
    await driver.sleep(500)

    const currentPath = await driver.evaluateJS<string>(`
      globalThis.__E2E_ROUTER__?.state?.location?.pathname ?? 'unknown'
    `)
    expect(currentPath).toBe(`/library/song/${songId}`)
  })

  test('歌曲 API 返回元信息', async () => {
    const songId = songs[0].id
    const res = await fetch(`http://localhost:58091/api/v1/songs/${songId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.ok).toBe(true)
    const song = await res.json() as any
    expect(song.title).toBeTruthy()
    expect(song.id).toBe(songId)
  })

  test('播放当前歌曲', async () => {
    await driver.evaluateJS(`
      (async () => {
        const store = globalThis.__E2E_PLAYER_STORE__;
        await store.getState().playSong(${JSON.stringify(songs[0])});
      })()
    `)

    await driver.waitFor(
      async () => (await driver.getPlayerState()).state === 'playing',
      { timeout: 8000 },
    )

    const state = await driver.getPlayerState()
    expect(state.songTitle).toBe(songs[0].title)
  })
})
