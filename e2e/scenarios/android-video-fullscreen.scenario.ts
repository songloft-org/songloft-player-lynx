import { execSync } from 'node:child_process'

import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { createDriver, type E2EDriver } from '../driver/index.js'
import { fetchRealSongs, fetchVideoSong } from '../fixtures/songs.js'

/**
 * Fullscreen native video (Android). iOS gets its own file — the assertions there
 * cannot use `dumpsys`.
 *
 * The point of this feature is that the picture comes from the **one** player that is
 * already playing: the video screen only lends it a surface. So the assertions worth
 * making are the ones that fail if someone ever "simplifies" it into a second player
 * or forgets to hand the surface back:
 *
 *  - the activity is really resumed (not merely started);
 *  - position keeps advancing across open *and* close, never re-buffering — a reload
 *    would show up as a gap and a `loading` state;
 *  - an audio-only track still plays after closing. Skipping `detachVideoOutput`
 *    leaves ExoPlayer drawing into a destroyed window, and the *next* track dies
 *    inside the video renderer with nothing on screen to explain it.
 *
 * **Needs a video song in the library**, and skips *visibly* when there is none
 * rather than passing on an empty run — a bailing `return` inside each test would
 * report five greens for zero coverage. To enable it, drop one in and rescan:
 *
 * ```
 * ffmpeg -f lavfi -i "testsrc2=size=640x360:rate=25:duration=60" \
 *        -f lavfi -i "sine=frequency=330:duration=60" \
 *        -c:v libx264 -pix_fmt yuv420p -preset veryfast -c:a aac -shortest \
 *        <music-dir>/video-fixture.mp4
 * ```
 *
 * The scanner ignores files younger than ~10 s, so wait before triggering the scan.
 */
const PKG = 'org.songloft.lynx'
// Mirrors `createDriver()`, which treats an unset `E2E_PLATFORM` as Android. An
// `=== 'android'` test here would silently skip every case under a bare
// `pnpm run test:e2e` (batch 48 shipped exactly that mistake).
const onAndroid = (process.env.E2E_PLATFORM ?? 'android') === 'android'

const sh = (cmd: string): string => {
  try {
    return execSync(cmd, { encoding: 'utf8' })
  } catch {
    return ''
  }
}

/**
 * The activity the system considers foregrounded.
 *
 * `topResumedActivity=` is what this Android 13 image prints — **measured**, not
 * assumed. `mResumedActivity` (the name in plenty of older snippets) does not appear
 * at all here, and a helper that silently returns '' would have made every assertion
 * below read as "the activity did not start".
 */
const resumedActivity = (): string =>
  /topResumedActivity=[^\n]*/.exec(sh(`adb shell dumpsys activity activities`))?.[0] ?? ''

async function playerState(driver: E2EDriver): Promise<{
  state: string
  positionMs: number
  errorMessage?: string
}> {
  const s = await driver.getPlayerState()
  return { state: s.state, positionMs: s.positionMs, errorMessage: s.errorMessage }
}

// Fetched at module scope because `test.skipIf` is evaluated during collection,
// before any hook has run.
const videoSong = onAndroid ? await fetchVideoSong() : null
const runnable = onAndroid && videoSong != null

describe('全屏视频（Android）', () => {
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
    // The platform read decides the whole direct/transcode split, so pin it here
    // rather than trusting that `SystemInfo.platform` is still spelled the same.
    expect(await driver.evaluateJS<string>(`globalThis.__E2E_VIDEO__.platformTarget()`))
      .toBe('android')
  })

  test.skipIf(!runnable)('MP4 视频歌判为直出', async () => {
    const kind = await driver.evaluateJS<string>(
      `globalThis.__E2E_VIDEO__.sourceKind(${JSON.stringify(JSON.stringify(videoSong))})`,
    )
    expect(kind).toBe('direct')
  })

  test.skipIf(!runnable)('open() 起了全屏 Activity 且播放不中断', async () => {
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

    expect(await driver.evaluateJS<boolean>(`globalThis.__E2E_VIDEO__.open()`)).toBe(true)
    await driver.sleep(2000)

    const resumed = resumedActivity()
    expect(resumed, 'dumpsys 里没有 topResumedActivity，断言会变成空气').not.toBe('')
    expect(resumed, '全屏 Activity 没有 resumed').toContain('SongloftVideoActivity')
    expect(await driver.evaluateJS<boolean>(`globalThis.__E2E_VIDEO__.isOpen()`)).toBe(true)

    const during = await playerState(driver)
    // A reload would reset the position and pass through `loading`; attaching a
    // surface to the running player cannot.
    expect(during.state, '进全屏后状态变了').toBe('playing')
    expect(during.positionMs, '进全屏打断了播放').toBeGreaterThan(before.positionMs)
    expect(during.errorMessage ?? null).toBeNull()
  })

  test.skipIf(!runnable)('close() 回到主界面，音频继续', async () => {
    const before = await playerState(driver)
    await driver.evaluateJS(`globalThis.__E2E_VIDEO__.close()`)
    await driver.sleep(2000)

    expect(resumedActivity()).toContain('MainActivity')
    expect(await driver.evaluateJS<boolean>(`globalThis.__E2E_VIDEO__.isOpen()`)).toBe(false)
    const after = await playerState(driver)
    expect(after.state, '退出全屏把播放停了').toBe('playing')
    expect(after.positionMs).toBeGreaterThan(before.positionMs)
  })

  test.skipIf(!runnable)('退出后纯音频歌仍能播（验 detach）', async () => {
    // The one assertion that catches a missing `detachVideoOutput()`: the video
    // renderer keeps pushing frames at a destroyed surface and takes the next track
    // down with it. Entirely silent inside the app.
    const audioOnly = (await fetchRealSongs(3)).find((s) => s.is_video !== true)
    expect(audioOnly, '曲库里没有纯音频歌，这条断言会变成空气').toBeDefined()
    await driver.evaluateJS(`
      (async () => {
        const store = globalThis.__E2E_PLAYER_STORE__;
        store.getState().reset();
        await store.getState().playPlaylist([{
          id: ${audioOnly.id}, type: 'local', title: 'audio-only',
          format: ${JSON.stringify(audioOnly.format ?? '')},
          url: ${JSON.stringify(audioOnly.url ?? `/api/v1/songs/${audioOnly.id}/play`)},
          duration: ${audioOnly.duration ?? 60}, year: 0, fileSize: 0, bitRate: 0,
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
