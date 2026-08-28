import { execSync } from 'node:child_process'

import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { createDriver, type E2EDriver } from '../driver/index.js'

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

const serviceRunning = (): boolean =>
  sh(`adb shell dumpsys activity services ${PKG}`).includes('FloatingLyricService')

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
    driver = await createDriver()
    await driver.launch()
    await driver.login('admin', 'admin')
    // The user grants this in system settings; e2e grants it via appops. Only
    // possible at all because the manifest declares the permission.
    sh(`adb shell appops set ${PKG} SYSTEM_ALERT_WINDOW allow`)
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
    // Two lines (current + next), so the height difference is unmistakable rather
    // than the couple of pixels a single short line moves.
    await call(driver, 'updateLyric', `${JSON.stringify('第一行')},${JSON.stringify('第二行')}`)
    await driver.sleep(1200)
    expect(
      overlayRequestedHeight(),
      '窗口高度没变 —— 文本没写进去（异常被模块的 catch 吞掉时就是这样）',
    ).toBeGreaterThan(empty + 20)
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
