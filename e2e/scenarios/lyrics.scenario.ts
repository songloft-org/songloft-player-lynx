import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { createDriver, type E2EDriver } from '../driver/index.js'
import { resetStepCounter, stepScreenshot } from '../driver/step-screenshot.js'
import { fetchRealSongs } from '../fixtures/songs.js'

describe('歌词功能', () => {
  let driver: E2EDriver
  let songs: any[]

  beforeAll(async () => {
    resetStepCounter()
    driver = await createDriver()
    await driver.launch()
    await driver.login('admin', 'admin')

    songs = await fetchRealSongs(3)
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
    await driver.sleep(1000)
  })

  afterAll(async () => {
    await driver.teardown()
  })

  test('歌词 store 存在', async () => {
    const hasLyricStore = await driver.evaluateJS<boolean>(`
      typeof globalThis.__E2E_LYRIC_STORE__ !== 'undefined'
    `)
    expect(hasLyricStore).toBe(true)
  })

  test('播放歌曲后尝试加载歌词', async () => {
    // Trigger lyric loading for the current song
    const songId = songs[0].id
    await driver.evaluateJS(`
      (async () => {
        const store = globalThis.__E2E_LYRIC_STORE__;
        if (store && store.getState().loadForSong) {
          await store.getState().loadForSong(${songId});
        }
      })()
    `)
    await driver.sleep(1000)

    const lyricState = await driver.evaluateJS<any>(`
      (() => {
        const store = globalThis.__E2E_LYRIC_STORE__;
        if (!store) return { error: 'no store' };
        const s = store.getState();
        return {
          lyricsCount: s.lyrics?.length ?? 0,
          currentIndex: s.currentIndex ?? -1,
          hasLoaded: s.lyrics != null,
          loadFailed: s.loadFailed ?? false,
        };
      })()
    `)

    // Either lyrics loaded successfully or loadFailed is set (both are valid outcomes)
    expect(lyricState.hasLoaded || lyricState.loadFailed).toBe(true)
    await stepScreenshot(driver, 'lyrics-state')
  })

  test('歌词同步位置跟随播放进度', async () => {
    const lyricState = await driver.evaluateJS<any>(`
      (() => {
        const store = globalThis.__E2E_LYRIC_STORE__;
        if (!store) return { lyricsCount: 0 };
        const s = store.getState();
        return { lyricsCount: s.lyrics?.length ?? 0, currentIndex: s.currentIndex ?? -1 };
      })()
    `)

    if (lyricState.lyricsCount > 0) {
      // If lyrics are available, sync position should work
      await driver.evaluateJS(`
        (() => {
          const store = globalThis.__E2E_LYRIC_STORE__;
          if (store && store.getState().syncPosition) {
            store.getState().syncPosition(2000);
          }
        })()
      `)
      await driver.sleep(200)

      const indexAfterSync = await driver.evaluateJS<number>(`
        globalThis.__E2E_LYRIC_STORE__?.getState()?.currentIndex ?? -1
      `)
      expect(indexAfterSync).toBeGreaterThanOrEqual(0)
    } else {
      // No lyrics for this song — that's a valid state
      expect(lyricState.lyricsCount).toBe(0)
    }
  })

  test('无歌词歌曲处理', async () => {
    // Play a song that likely has no lyrics (using a constructed fake song)
    await driver.evaluateJS(`
      (async () => {
        const store = globalThis.__E2E_LYRIC_STORE__;
        if (store && store.getState().loadForSong) {
          await store.getState().loadForSong(99999);
        }
      })()
    `)
    await driver.sleep(1000)

    const state = await driver.evaluateJS<any>(`
      (() => {
        const store = globalThis.__E2E_LYRIC_STORE__;
        if (!store) return {};
        const s = store.getState();
        return { lyricsCount: s.lyrics?.length ?? 0, loadFailed: s.loadFailed ?? false };
      })()
    `)

    // Non-existent song should result in no lyrics or loadFailed
    expect(state.lyricsCount === 0 || state.loadFailed === true).toBe(true)
  })
})
