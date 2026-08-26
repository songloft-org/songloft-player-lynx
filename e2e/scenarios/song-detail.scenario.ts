import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { createDriver, type E2EDriver } from '../driver/index.js'
import { fetchRealSongs, getToken } from '../fixtures/songs.js'

/**
 * 歌曲信息/编辑弹窗（原「歌曲详情」两条路由已删，全部弹窗化）。
 *
 * 弹窗经 `__E2E_SONG_OVERLAYS__`（song-row-overlays store）驱动——与行内
 * `⋯` 菜单同一条路径。断言落在 store 状态上：互斥（info/edit/menu 同时
 * 只有一个）与返回键弹层深度，这两者从截图上分辨不出来。
 */
describe('歌曲信息与编辑弹窗', () => {
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

  test('打开歌曲信息弹窗：互斥清掉其它弹层', async () => {
    const overlays = await driver.evaluateJS<any>(`
      (() => {
        const store = globalThis.__E2E_SONG_OVERLAYS__
        // No row context: the e2e store-level path is the narrow-screen menu
        // (all five items) — pruning is the row's job, gated in unit tests.
        store.getState().openMenu({ song: ${JSON.stringify(songs[0])} })
        store.getState().openInfo(${JSON.stringify(songs[0])})
        const s = store.getState()
        return { infoSongId: s.infoSong?.id ?? null, menuSong: s.menuSong, editSong: s.editSong }
      })()
    `)
    expect(overlays.infoSongId).toBe(songs[0].id)
    expect(overlays.menuSong).toBeNull()
    expect(overlays.editSong).toBeNull()
  })

  test('信息弹窗的编辑动作切换到编辑弹窗（单槽，不叠加）', async () => {
    const overlays = await driver.evaluateJS<any>(`
      (() => {
        const store = globalThis.__E2E_SONG_OVERLAYS__
        store.getState().openEdit(${JSON.stringify(songs[0])})
        const s = store.getState()
        return { editSongId: s.editSong?.id ?? null, infoSong: s.infoSong }
      })()
    `)
    expect(overlays.editSongId).toBe(songs[0].id)
    expect(overlays.infoSong).toBeNull()
  })

  test('返回键逐个关闭弹窗，depth 归零', async () => {
    await driver.evaluateJS(`
      (() => {
        const store = globalThis.__E2E_SONG_OVERLAYS__
        store.getState().openInfo(${JSON.stringify(songs[0])})
      })()
    `)
    await driver.sleep(300)

    const depthWithDialog = await driver.evaluateJS<number>(`
      globalThis.__E2E_BACK__.depth()
    `)
    expect(depthWithDialog).toBeGreaterThanOrEqual(1)

    await driver.evaluateJS(`globalThis.__E2E_BACK__.dispatch()`)
    await driver.sleep(300)

    const overlays = await driver.evaluateJS<any>(`
      (() => {
        const s = globalThis.__E2E_SONG_OVERLAYS__.getState()
        return { infoSong: s.infoSong, editSong: s.editSong, depth: globalThis.__E2E_BACK__.depth() }
      })()
    `)
    expect(overlays.infoSong).toBeNull()
    expect(overlays.editSong).toBeNull()
    expect(overlays.depth).toBe(0)
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

  test('播放当前歌曲（菜单 play 项同路径）', async () => {
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
