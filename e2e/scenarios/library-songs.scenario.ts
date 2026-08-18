import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { createDriver, type E2EDriver } from '../driver/index.js'
import { resetStepCounter, stepScreenshot } from '../driver/step-screenshot.js'
import { fetchRealSongs, getToken } from '../fixtures/songs.js'

describe('曲库：歌曲列表', () => {
  let driver: E2EDriver
  let songs: any[]

  beforeAll(async () => {
    resetStepCounter()
    driver = await createDriver()
    await driver.launch()
    await driver.login('admin', 'admin')

    songs = await fetchRealSongs(5)

    await driver.evaluateJS(`
      globalThis.__E2E_ROUTER__?.navigate({ to: '/library' })
    `)
    await driver.sleep(1000)
  })

  afterAll(async () => {
    await driver.teardown()
  })

  test('导航到曲库页面成功', async () => {
    const currentPath = await driver.evaluateJS<string>(`
      globalThis.__E2E_ROUTER__?.state?.location?.pathname ?? 'unknown'
    `)
    expect(currentPath).toBe('/library')
    await stepScreenshot(driver, 'library-loaded')
  })

  test('歌曲列表数据可用', async () => {
    // Verify songs are available from Node.js-side fetch
    expect(songs.length).toBeGreaterThanOrEqual(3)
    expect(songs[0].title).toBeTruthy()
  })

  test('点击歌曲 → 开始播放', async () => {
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
    expect(state.state).toBe('playing')
    expect(state.songTitle).toBe(songs[0].title)
    await stepScreenshot(driver, 'library-song-playing')
  })

  test('播放全部歌曲 → 队列长度匹配', async () => {
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

    const queueLength = await driver.evaluateJS<number>(`
      globalThis.__E2E_PLAYER_STORE__.getState().playlist?.length ?? 0
    `)
    expect(queueLength).toBe(5)
  })

  test('获取曲库统计数据', async () => {
    // Fetch stats from API using the same token as songs fetch
    const res = await fetch('http://localhost:58091/api/v1/songs/stats', {
      headers: { Authorization: `Bearer ${(await getToken())}` },
    })
    const stats = await res.json() as any
    // Real server uses total_songs, mock uses songCount
    const songCount = stats.total_songs ?? stats.songCount ?? 0
    expect(songCount).toBeGreaterThan(0)
    const albumCount = stats.album_count ?? stats.albumCount ?? 0
    expect(albumCount).toBeGreaterThan(0)
  })

  test('导航到分类浏览', async () => {
    await driver.evaluateJS(`
      globalThis.__E2E_ROUTER__?.navigate({ to: '/library', search: { view: 'artist' } })
    `)
    await driver.sleep(500)

    const currentPath = await driver.evaluateJS<string>(`
      globalThis.__E2E_ROUTER__?.state?.location?.pathname ?? 'unknown'
    `)
    expect(currentPath).toBe('/library')
  })
})
