import { execSync } from 'node:child_process'

import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { createDriver, type E2EDriver } from '../driver/index.js'
import { fetchRealSongs } from '../fixtures/songs.js'

/**
 * Floating-lyrics overlay (Android only — iOS has no equivalent surface).
 *
 * This feature has now died silently **three** separate ways, each invisible to
 * every other gate in the repo:
 *
 *  1. the module's methods lacked `@LynxMethod` (batch 43),
 *  2. the manifest declared neither `SYSTEM_ALERT_WINDOW` nor the service, so
 *     `canDrawOverlays()` could only return false and `startService` resolved
 *     nothing — and `startService` does not throw for that (batch 48),
 *  3. `updateText` touched the view from the Lynx JS thread, and the resulting
 *     `CalledFromWrongThreadException` was swallowed by a bare `catch` in the
 *     module, so every lyric line vanished into an overlay that showed nothing
 *     (batch 48).
 *
 * None of those produce an error the page can see: the TS facade returns a
 * resolved promise either way. So the assertions here deliberately live **outside
 * the app process**, in `dumpsys` — the service really running, a real overlay
 * window existing, and the window really being re-laid-out when a lyric arrives.
 * Asserting `isShowing()` alone would just be asking the suspect for an alibi.
 */
const PKG = 'org.songloft.lynx'
// Mirrors `createDriver()`, which treats an unset `E2E_PLATFORM` as Android. An
// `=== 'android'` test here would silently skip all five cases under the bare
// `pnpm run test:e2e` — which is how this file first "passed" a full suite run.
const onAndroid = (process.env.E2E_PLATFORM ?? 'android') === 'android'

const sh = (cmd: string): string => execSync(cmd, { encoding: 'utf8' })

/** Windows the system attributes to this package (the overlay has no activity suffix). */
const packageWindows = (): string[] =>
  sh('adb shell dumpsys window windows')
    .split('\n')
    .filter((l) => l.includes(`Window{`) && l.includes(PKG))
    .map((l) => l.trim())

/**
 * Is the overlay service actually alive?
 *
 * **Only the `active services` section counts.** `dumpsys` also keeps a
 * `Destroying services` list, and a record can sit there until the next reboot
 * (`app=null destroying=true crashCount=1`) once the process died mid-teardown.
 * Grepping the whole dump reads that corpse as a live service — measured: `hide()`
 * and the task-removal case both went permanently red on an emulator carrying a
 * 7-minute-old zombie, with the app behaving perfectly.
 */
const serviceRunning = (): boolean => {
  const dump = sh(`adb shell dumpsys activity services ${PKG}`)
  const start = dump.search(/active services:/)
  if (start === -1) return false
  const fromActive = dump.slice(start)
  // Next section header (`  Destroying services:` …); entries start with `* `, and
  // no entry line contains `services:`.
  const end = fromActive.search(/\n {2}(?!\*)\S[^\n]*services:/)
  return (end === -1 ? fromActive : fromActive.slice(0, end)).includes('FloatingLyricService')
}

/** Height the window manager was asked for — grows with the text the view holds. */
const overlayRequestedHeight = (): number => {
  const dump = sh('adb shell dumpsys window windows')
  const header = new RegExp(`Window #\\d+ Window\\{\\w+ u0 ${PKG.replace(/\./g, '\\.')}\\}:`).exec(
    dump,
  )
  if (!header) return -1
  const block = dump.slice(dump.indexOf(header[0]), dump.indexOf(header[0]) + 2600)
  return Number(/Requested w=\d+ h=(\d+)/.exec(block)?.[1] ?? -1)
}

async function call(driver: E2EDriver, method: string, arg = ''): Promise<unknown> {
  return driver.evaluateJS(`globalThis.__E2E_FLOATING_LYRIC__.${method}(${arg})`)
}

describe('悬浮歌词（Android）', () => {
  let driver: E2EDriver

  beforeAll(async () => {
    if (!onAndroid) return
    // 干净起点：launch() 会复用已运行的实例，而本功能的缺陷残留物（冻结的悬浮窗）
    // 恰好就在那个实例里 —— show() 因 service 已在展示而不加新窗，下方断言全部失真。
    try { sh(`adb shell am force-stop ${PKG}`) } catch { /* noop */ }
    driver = await createDriver()
    await driver.sleep(500)
    await driver.launch()
    await driver.login('admin', 'admin')
    // The user grants this in system settings; e2e grants it via appops. Only
    // possible at all because the manifest declares the permission.
    sh(`adb shell appops set ${PKG} SYSTEM_ALERT_WINDOW allow`)
    // 该功能若在设备上被开启过（pref 随数据保留），启动路径会自动 show 出一个空
    // 文本悬浮窗 —— 下方「show() 新增窗口」的增量断言全部失真（showOverlay 对
    // 已在展示的窗是 no-op）。先摘掉，从已知基线开始。
    await call(driver, 'hide')
    await driver.sleep(1000)
  })

  afterAll(async () => {
    if (!onAndroid) return
    await call(driver, 'hide')
    await driver.teardown()
  })

  test.skipIf(!onAndroid)('模块经 e2e bridge 可达', async () => {
    // `NativeModules` is not reachable from the eval scope at all — neither bare
    // nor on `globalThis` (measured) — so the bridge is the only handle.
    const kind = await driver.evaluateJS<string>(
      `typeof globalThis.__E2E_FLOATING_LYRIC__ === 'object' ? 'present' : 'absent'`,
    )
    expect(kind).toBe('present')
  })

  test.skipIf(!onAndroid)('授权后 requestPermission 为 true', async () => {
    expect(await call(driver, 'requestPermission')).toBe(true)
  })

  test.skipIf(!onAndroid)('show() 起了 service 并加了一个覆盖窗口', async () => {
    const before = packageWindows().length
    await call(driver, 'show')
    await driver.sleep(1200)
    expect(serviceRunning(), 'FloatingLyricService 没起来（manifest 漏声明会这样）').toBe(true)
    expect(packageWindows().length, '没有多出覆盖窗口').toBeGreaterThan(before)
    expect(await call(driver, 'isShowing')).toBe(true)
  })

  test.skipIf(!onAndroid)('updateLyric 真的改变了覆盖层布局', async () => {
    const empty = overlayRequestedHeight()
    expect(empty, '找不到覆盖窗口').toBeGreaterThan(0)
    // The freshly-shown window already reserves TWO line boxes: both TextViews
    // start VISIBLE, and an empty TextView still takes its font-metrics height —
    // measured h=67 empty vs h=70 with two short CJK lines (the +3 is just the
    // glyphs). So "empty -> two short lines" only moves a few pixels, the exact
    // couple-of-pixels trap the original assertion tried to avoid. The stable
    // layout signal is wrapping: a line that cannot fit on one row forces the
    // WRAP_CONTENT window to grow by whole line boxes, on any density.
    const longLine = '长'.repeat(60)
    await call(driver, 'updateLyric', `${JSON.stringify(longLine)},${JSON.stringify('第二行')}`)
    await driver.sleep(1200)
    expect(
      overlayRequestedHeight(),
      '窗口高度没变 —— 文本没写进去（异常被模块的 catch 吞掉时就是这样）',
    ).toBeGreaterThan(empty + 20)
    // Restore short text so the next test measures a regular two-line window.
    await call(driver, 'updateLyric', `${JSON.stringify('第一行')},${JSON.stringify('第二行')}`)
    await driver.sleep(1200)
  })

  test.skipIf(!onAndroid)('setTwoLine(false) 真的收掉了第二行', async () => {
    // Previous test left both lines showing, so this window is two lines tall.
    const two = overlayRequestedHeight()
    expect(two, '找不到覆盖窗口').toBeGreaterThan(0)
    await call(driver, 'setTwoLine', 'false')
    await driver.sleep(1200)
    expect(
      overlayRequestedHeight(),
      '关闭双行后窗口高度没有收缩 —— 第二行没有被 GONE 掉',
    ).toBeLessThan(two)
    // Restore the default so later tests / teardown see the reference look.
    await call(driver, 'setTwoLine', 'true')
  })

  test.skipIf(!onAndroid)('hide() 撤掉窗口并停掉 service', async () => {
    await call(driver, 'hide')
    await driver.sleep(1200)
    expect(serviceRunning(), 'hide 之后 service 仍在运行').toBe(false)
    expect(overlayRequestedHeight(), '覆盖窗口没被撤掉').toBe(-1)
  })
})

/**
 * 杀后台（移除任务）必须摘掉悬浮窗。
 *
 * 划掉最近任务卡片移除的是**任务**，不是进程 —— 前台媒体播放服务把进程钉住 ——
 * 而 LynxView 和推 `updateLyric` 的 JS 随任务死亡。若 FloatingLyricService 在
 * 任务移除后继续运行，覆盖窗就成了一块无人更新、无处可关的冻结残影（真机报障）。
 * manifest 里的 `android:stopWithTask="true"` 让系统在该时刻停掉服务、`onDestroy`
 * 摘窗。断言全部落在 App 进程之外的 dumpsys/pidof 上 —— 事后向 isShowing() 求证
 * 等于让嫌疑人自证清白，何况此刻 JS 已死、无人应答。
 */
describe('悬浮歌词：移除任务（杀后台）必须摘掉覆盖窗', () => {
  let driver: E2EDriver
  /** 移除任务前的进程 pid —— 事后必须不变，窗口消失必须是摘窗而非进程死亡。 */
  let baselinePid = ''

  /** 任务移除的清理是异步的：轮询等窗口与 service 都落地。 */
  const overlayGone = async (): Promise<boolean> => {
    for (let i = 0; i < 10; i++) {
      if (overlayRequestedHeight() === -1 && !serviceRunning()) return true
      await driver.sleep(500)
    }
    return false
  }

  const pid = (): string => sh(`adb shell pidof ${PKG}`).trim()

  const lyricTaskId = (): number | null => {
    const m = /taskId=(\d+):[^\n]*org\.songloft\.lynx/.exec(sh('adb shell am stack list'))
    return m ? Number(m[1]) : null
  }

  beforeAll(async () => {
    if (!onAndroid) return
    driver = await createDriver()
    await driver.launch()
    await driver.login('admin', 'admin')
    sh(`adb shell appops set ${PKG} SYSTEM_ALERT_WINDOW allow`)
    // 播放流走设备侧 localhost:58091（resolvedBaseUrl 由 driver 指向它）。
    sh('adb reverse tcp:58091 tcp:58091')
  })

  afterAll(async () => {
    if (!onAndroid) return
    // 移除任务已杀死 JS，hide() 无人应答；force-stop 收掉残留的播放服务。
    try { sh(`adb shell am force-stop ${PKG}`) } catch { /* noop */ }
    await driver.teardown()
  })

  test.skipIf(!onAndroid)('播放中 show()：窗口、service、进程俱在', async () => {
    const [song] = await fetchRealSongs(1)
    await driver.evaluateJS(`
      (async () => {
        const store = globalThis.__E2E_PLAYER_STORE__;
        await store.getState().playSong(${JSON.stringify(song)});
      })()
    `)
    await driver.waitFor(
      async () => (await driver.getPlayerState()).state === 'playing',
      { timeout: 10000 },
    )
    await call(driver, 'show')
    await driver.sleep(1200)
    expect(serviceRunning(), 'FloatingLyricService 没起来').toBe(true)
    expect(overlayRequestedHeight(), '覆盖窗口不在').toBeGreaterThan(0)
    baselinePid = pid()
    expect(baselinePid, '拿不到进程 pid').not.toBe('')
  })

  test.skipIf(!onAndroid)('退后台（不移除任务）：窗口仍在 —— 常驻设计不回归', async () => {
    sh('adb shell input keyevent KEYCODE_HOME')
    await driver.sleep(1000)
    expect(serviceRunning()).toBe(true)
    expect(overlayRequestedHeight(), '退后台不该摘窗（双击返回退后台依赖常驻）').toBeGreaterThan(0)
    sh(`adb shell am start -n ${PKG}/.MainActivity`)
    await driver.sleep(1000)
  })

  test.skipIf(!onAndroid)('移除任务：窗口摘掉、service 停掉、进程被播放钉住不死', async () => {
    const taskId = lyricTaskId()
    expect(taskId, 'am stack list 里找不到本包任务').not.toBeNull()
    sh(`adb shell am stack remove ${taskId}`)
    expect(
      await overlayGone(),
      '任务移除后覆盖窗/service 未被清掉（stopWithTask 没生效？）',
    ).toBe(true)
    expect(pid(), '进程应被前台播放服务钉住 —— 窗口消失必须是摘窗而不是进程死亡').toBe(baselinePid)
    // 音乐继续是有意设计：播放服务还在前台。
    expect(sh(`adb shell dumpsys activity services ${PKG}`)).toContain('SongloftPlaybackService')
  })

  test.skipIf(!onAndroid)('重启后 service 可重建、覆盖窗可重开', async () => {
    await driver.teardown()
    try { sh(`adb shell am force-stop ${PKG}`) } catch { /* noop */ }
    await driver.sleep(800)
    await driver.launch()
    await call(driver, 'show')
    await driver.sleep(1200)
    expect(await call(driver, 'isShowing')).toBe(true)
    expect(overlayRequestedHeight(), '重开后覆盖窗没重建').toBeGreaterThan(0)
  })
})

/**
 * 授权往返 —— 2026-08-28 真机报障（悬浮歌词第六重死）。
 *
 * 「首次打开开关去授权，返回后开关是开的，但没有歌词窗口；再关一次开一次才正常。」
 * 根因在 `requestPermission` 的时序：`Settings.ACTION_MANAGE_OVERLAY_PERMISSION`
 * **不能 `startActivityForResult`、不回传任何结果**，而旧实现 `startActivity` 之后
 * 紧接着就答 `false` —— 对每一次「用户正要去授权」的动作都回答「拒绝」，于是 JS 侧
 * `if (granted) show()` 永不成立。
 *
 * 这条链**只在未授权时存在**：授权已在手时模块走的是早返回分支，上面几个 describe
 * 全程 `appops allow`，所以它们无论修没修都是绿的。判据也不能是 `isShowing()` ——
 * 那时窗口确实不在，问题在于「谁都没打算开它」。所以这里量的是**答复本身何时到达**：
 * 把 promise 挂在 `globalThis` 上，在系统页仍在前台时读一次（必须还是 pending，
 * 旧实现在这一刻已经是 `'false'`），按返回键回到 App 之后再读一次。
 */
describe('悬浮歌词：授权答复必须等到从系统页返回之后', () => {
  let driver: E2EDriver

  /**
   * 前台 Activity —— 用来证明系统授权页真的开了 / 真的关了。
   *
   * 这台 Android 14 模拟器打印的是 `topResumedActivity=` 与 `ResumedActivity:`，**没有**
   * `mResumedActivity`（旧版格式）。首版正则只认后者，于是恒返回空串：授权页那条 waitFor
   * 一直等到超时，而「hasPermission 不弹界面」那条拿 `'' === ''` 空转通过。故下方各用例
   * 都先断言这个值里有包名/`Settings`，别让格式漂移再变成假绿。
   */
  const topActivity = (): string =>
    /ResumedActivity[=:]\s*ActivityRecord\{\S+ u\d+ (\S+)/.exec(
      sh('adb shell dumpsys activity activities'),
    )?.[1] ?? ''

  const grantAnswer = async (): Promise<string> =>
    driver.evaluateJS<string>('String(globalThis.__grantAnswer)')

  const pid = (): string => sh(`adb shell pidof ${PKG}`).trim()

  beforeAll(async () => {
    if (!onAndroid) return
    try { sh(`adb shell am force-stop ${PKG}`) } catch { /* noop */ }
    // 起点必须是「未授权」：这一整条链在已授权下压根不会发生。
    sh(`adb shell appops set ${PKG} SYSTEM_ALERT_WINDOW deny`)
    driver = await createDriver()
    await driver.sleep(500)
    await driver.launch()
  })

  afterAll(async () => {
    if (!onAndroid) return
    // 其余场景都假定已授权，别把 deny 留给它们。
    sh(`adb shell appops set ${PKG} SYSTEM_ALERT_WINDOW allow`)
    try { await call(driver, 'hide') } catch { /* noop */ }
    await driver.teardown()
  })

  test.skipIf(!onAndroid)('未授权时 hasPermission 为 false，且不把用户弹去系统页', async () => {
    const before = topActivity()
    expect(before, '读不到前台 Activity —— 下面的比较会空转通过').toContain(PKG)
    expect(await call(driver, 'hasPermission')).toBe(false)
    await driver.sleep(1000)
    // 启动链与进入歌词设置页都用它，弹界面就等于劫持启动 / 劫持进页。
    expect(topActivity(), 'hasPermission 打开了界面').toBe(before)
  })

  /*
   * 未授权时的 `show()` 是一个**杀进程**的地雷，实测撞到过：
   * `FATAL EXCEPTION: main / Unable to start service FloatingLyricService …
   * BadTokenException: permission denied for window type 2038` —— `addView` 抛在
   * `onStartCommand` 里，未捕获就是整个进程死。「调用方检查过」不够：授权能被随时撤销，
   * 而 `START_STICKY` 还会在那之后重发 SHOW。
   */
  test.skipIf(!onAndroid)('未授权时 show() 不出窗，也不能杀进程', async () => {
    const before = pid()
    expect(before, '拿不到进程 pid').not.toBe('')
    await call(driver, 'show')
    await driver.sleep(1500)
    expect(pid(), 'show() 在无授权时把进程撞掉了').toBe(before)
    expect(overlayRequestedHeight(), '无授权居然出窗了').toBe(-1)
  })

  test.skipIf(!onAndroid)('requestPermission 在系统页期间不作答，授权并返回后才答 true', async () => {
    // 故意 fire-and-forget：这个 promise 就是要挂着，直到 App 重回前台。
    await driver.evaluateJS(`
      globalThis.__grantAnswer = 'pending';
      globalThis.__E2E_FLOATING_LYRIC__.requestPermission()
        .then((r) => { globalThis.__grantAnswer = String(r) });
      'ok'
    `)
    await driver.waitFor(async () => topActivity().includes('Settings'), { timeout: 8000 })

    expect(
      await grantAnswer(),
      '系统页还在前台就已经答复了 —— 这正是那个 bug：答案必然是「拒绝」，而用户才刚要去授权',
    ).toBe('pending')

    // 用户在那个页面上打开开关（e2e 用 appops 等效替代），然后按返回回到 App。
    sh(`adb shell appops set ${PKG} SYSTEM_ALERT_WINDOW allow`)
    sh('adb shell input keyevent KEYCODE_BACK')
    await driver.waitFor(async () => topActivity().includes(PKG), { timeout: 8000 })
    await driver.waitFor(async () => (await grantAnswer()) !== 'pending', { timeout: 8000 })

    expect(await grantAnswer(), '返回后答复不是 true —— onResume 的重读没接上').toBe('true')
  })

  test.skipIf(!onAndroid)('设置页开关的完整链路：授权返回后自己就出窗（无需再关再开）', async () => {
    // 回到报障时的起点：未授权 + 无窗。
    sh(`adb shell appops set ${PKG} SYSTEM_ALERT_WINDOW deny`)
    await call(driver, 'hide')
    await driver.sleep(800)

    // 这一句就是开关 onChange 跑的那条链（授权 → pref → show）。
    await driver.evaluateJS(`
      globalThis.__enableResult = 'pending';
      globalThis.__E2E_FLOATING_LYRIC__.enableOverlay()
        .then((on) => { globalThis.__enableResult = String(on) });
      'ok'
    `)
    await driver.waitFor(async () => topActivity().includes('Settings'), { timeout: 8000 })
    expect(overlayRequestedHeight(), '还在系统页上就出窗了？').toBe(-1)

    sh(`adb shell appops set ${PKG} SYSTEM_ALERT_WINDOW allow`)
    sh('adb shell input keyevent KEYCODE_BACK')

    // 旧实现到这里就完了：enableOverlay 早已以 false 结束，永远等不到窗口。
    await driver.waitFor(async () => overlayRequestedHeight() > 0, { timeout: 10000 })
    expect(serviceRunning(), 'FloatingLyricService 没起来').toBe(true)
    expect(
      await driver.evaluateJS<string>('String(globalThis.__enableResult)'),
      'enableOverlay 没报 true —— 页面会把开关拨回去',
    ).toBe('true')
    // pref 写没写下去由下一例（重启后自行恢复）作证，**不要**拿
    // `driver.getStorageItem` 去读：它读的是 `globalThis.NativeModules`，而 eval 作用域
    // 里拿不到该对象（同 `__E2E_FLOATING_LYRIC__` 存在的原因），它在 Android 上恒返回 null。
  })

  test.skipIf(!onAndroid)('重启：pref 与授权都在，启动路径自己把窗口恢复出来', async () => {
    // 上一例留下的状态（pref true + 已授权）就是真实用户的常态。
    await driver.teardown()
    try { sh(`adb shell am force-stop ${PKG}`) } catch { /* noop */ }
    await driver.sleep(800)
    await driver.launch()
    await driver.waitFor(async () => overlayRequestedHeight() > 0, { timeout: 15000 })
    expect(serviceRunning()).toBe(true)
  })
})
