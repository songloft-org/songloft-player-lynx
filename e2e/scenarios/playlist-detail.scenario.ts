import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { createDriver, type E2EDriver } from '../driver/index.js'
import { resetStepCounter, stepScreenshot } from '../driver/step-screenshot.js'
import { fetchRealSongs, getToken } from '../fixtures/songs.js'

describe('播放列表详情', () => {
  let driver: E2EDriver
  let playlistId: number

  beforeAll(async () => {
    resetStepCounter()
    driver = await createDriver()
    await driver.launch()
    await driver.login('admin', 'admin')

    // Find a real playlist to test against
    const token = await getToken()
    const res = await fetch('http://localhost:58091/api/v1/playlists?limit=5', {
      headers: { Authorization: `Bearer ${token}` },
    })
    const data = await res.json() as any
    const playlists = data.items ?? data.playlists ?? []
    playlistId = playlists.length > 0 ? playlists[0].id : 1

    await driver.evaluateJS(`
      globalThis.__E2E_ROUTER__?.navigate({ to: '/playlists/${playlistId}' })
    `)
    await driver.sleep(1000)
  })

  afterAll(async () => {
    await driver.teardown()
  })

  test('导航到播放列表详情', async () => {
    const currentPath = await driver.evaluateJS<string>(`
      globalThis.__E2E_ROUTER__?.state?.location?.pathname ?? 'unknown'
    `)
    expect(currentPath).toBe(`/playlists/${playlistId}`)
    await stepScreenshot(driver, 'playlist-detail-loaded')
  })

  test('播放列表 API 返回数据', async () => {
    const token = await getToken()
    const res = await fetch(`http://localhost:58091/api/v1/playlists/${playlistId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.ok).toBe(true)
    const playlist = await res.json() as any
    expect(playlist.id).toBe(playlistId)
    expect(playlist.name).toBeTruthy()
  })

  test('播放列表歌曲列表可获取', async () => {
    const token = await getToken()
    const res = await fetch(
      `http://localhost:58091/api/v1/playlists/${playlistId}/songs?limit=10`,
      { headers: { Authorization: `Bearer ${token}` } },
    )
    expect(res.ok).toBe(true)
    const data = await res.json() as any
    const songs = data.songs ?? data.items ?? []
    // Playlist may be empty — that's OK
    expect(Array.isArray(songs)).toBe(true)
  })

  test('点击歌曲播放整个列表', async () => {
    const songs = await fetchRealSongs(3)
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

    const state = await driver.getPlayerState()
    expect(state.state).toBe('playing')
    expect(state.songTitle).toBe(songs[0].title)
    await stepScreenshot(driver, 'playlist-playing')
  })

  test('导航回曲库', async () => {
    await driver.evaluateJS(`
      globalThis.__E2E_ROUTER__?.navigate({ to: '/library' })
    `)
    await driver.sleep(500)

    const currentPath = await driver.evaluateJS<string>(`
      globalThis.__E2E_ROUTER__?.state?.location?.pathname ?? 'unknown'
    `)
    expect(currentPath).toBe('/library')
  })
})
