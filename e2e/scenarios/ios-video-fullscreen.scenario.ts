import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { createDriver, type E2EDriver } from '../driver/index.js'
import { fetchRealSongs, fetchVideoSong } from '../fixtures/songs.js'

/**
 * Fullscreen native video (iOS). The Android counterpart uses `dumpsys` to verify the
 * activity lifecycle; iOS verifies through the module's own `isOpen()` and player state
 * continuity — the same things that matter, minus the platform-specific inspection.
 *
 * Same design contract as Android: the picture comes from the **one** player already
 * playing; the video screen only lends it a surface (AVPlayerViewController). So the
 * assertions that catch regressions are:
 *
 *  - position keeps advancing across open *and* close (a reload would gap);
 *  - close does not pause audio (vc.player must be nil-ed before dismiss);
 *  - an audio-only track still plays after closing (detachVideoOutput not skipped).
 *
 * Needs a video song in the library — skips visibly when there is none.
 */
const onIos = process.env.E2E_PLATFORM === 'ios'

const videoSong = onIos ? await fetchVideoSong() : null
const runnable = onIos && videoSong != null

async function playerState(driver: E2EDriver): Promise<{
  state: string
  positionMs: number
  errorMessage?: string
}> {
  const s = await driver.getPlayerState()
  return { state: s.state, positionMs: s.positionMs, errorMessage: s.errorMessage }
}

describe('全屏视频（iOS）', () => {
  let driver: E2EDriver

  beforeAll(async () => {
    if (!runnable) return
    driver = await createDriver()
    await driver.launch()
    await driver.login('admin', 'admin')
  })

  afterAll(async () => {
    if (!runnable) return
    await driver.evaluateJS(`globalThis.__E2E_VIDEO__.close()`).catch(() => null)
    await driver.teardown()
  })

  test.skipIf(!runnable)('宿主报告自己支持全屏视频', async () => {
    expect(await driver.evaluateJS<boolean>(`globalThis.__E2E_VIDEO__.available()`)).toBe(true)
    expect(await driver.evaluateJS<string>(`globalThis.__E2E_VIDEO__.platformTarget()`))
      .toBe('ios')
  })

  test.skipIf(!runnable)('MP4 视频歌判为直出', async () => {
    const kind = await driver.evaluateJS<string>(
      `globalThis.__E2E_VIDEO__.sourceKind(${JSON.stringify(JSON.stringify(videoSong))})`,
    )
    expect(kind).toBe('direct')
  })

  test.skipIf(!runnable)('open() 呈现全屏且播放不中断', async () => {
    await driver.evaluateJS(`
      (async () => {
        const store = globalThis.__E2E_PLAYER_STORE__;
        store.getState().reset();
        await store.getState().playPlaylist([${JSON.stringify(videoSong)}], 0);
        return 'ok';
      })()
    `)
    await driver.waitFor(async () => (await playerState(driver)).state === 'playing', {
      timeout: 10_000,
    })
    await driver.sleep(1500)
    const before = await playerState(driver)

    expect(await driver.evaluateJS<string>(`globalThis.__E2E_VIDEO__.open()`)).toBe('opened')
    await driver.sleep(2000)

    expect(await driver.evaluateJS<boolean>(`globalThis.__E2E_VIDEO__.isOpen()`)).toBe(true)

    const during = await playerState(driver)
    expect(during.state, '进全屏后状态变了').toBe('playing')
    expect(during.positionMs, '进全屏打断了播放').toBeGreaterThan(before.positionMs)
    expect(during.errorMessage ?? null).toBeNull()
  })

  test.skipIf(!runnable)('close() 关闭全屏，音频继续', async () => {
    const before = await playerState(driver)
    await driver.evaluateJS(`globalThis.__E2E_VIDEO__.close()`)
    await driver.sleep(2000)

    expect(await driver.evaluateJS<boolean>(`globalThis.__E2E_VIDEO__.isOpen()`)).toBe(false)
    const after = await playerState(driver)
    expect(after.state, '退出全屏把播放停了').toBe('playing')
    expect(after.positionMs).toBeGreaterThan(before.positionMs)
  })

  test.skipIf(!runnable)('退出后纯音频歌仍能播（验 detach）', async () => {
    const audioOnly = (await fetchRealSongs(3)).find((s) => s.is_video !== true)
    expect(audioOnly, '曲库里没有纯音频歌，这条断言会变成空气').toBeDefined()
    await driver.evaluateJS(`
      (async () => {
        const store = globalThis.__E2E_PLAYER_STORE__;
        store.getState().reset();
        await store.getState().playPlaylist([{
          id: ${audioOnly!.id}, type: 'local', title: 'audio-only',
          format: ${JSON.stringify(audioOnly!.format ?? '')},
          url: ${JSON.stringify(audioOnly!.url ?? `/api/v1/songs/${audioOnly!.id}/play`)},
          duration: ${audioOnly!.duration ?? 60}, year: 0, fileSize: 0, bitRate: 0,
          sampleRate: 0, isLive: false, isVideo: false, addedAt: '', updatedAt: '',
        }], 0);
        return 'ok';
      })()
    `)
    await driver.sleep(4000)
    const s = await playerState(driver)
    expect(s.state, `纯音频歌播不动了：${s.errorMessage ?? ''}`).toBe('playing')
    expect(s.positionMs).toBeGreaterThan(0)
    expect(s.errorMessage ?? null).toBeNull()
  })
})
