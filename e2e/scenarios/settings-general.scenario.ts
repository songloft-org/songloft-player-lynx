import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { createDriver, type E2EDriver } from '../driver/index.js'
import { resetStepCounter, stepScreenshot } from '../driver/step-screenshot.js'

describe('设置页', () => {
  let driver: E2EDriver

  beforeAll(async () => {
    resetStepCounter()
    driver = await createDriver()
    await driver.launch()
    await driver.login('admin', 'admin')

    await driver.evaluateJS(`
      globalThis.__E2E_ROUTER__?.navigate({ to: '/settings' })
    `)
    await driver.sleep(500)
  })

  afterAll(async () => {
    await driver.teardown()
  })

  test('导航到设置页', async () => {
    const currentPath = await driver.evaluateJS<string>(`
      globalThis.__E2E_ROUTER__?.state?.location?.pathname ?? 'unknown'
    `)
    expect(currentPath).toBe('/settings')
    await stepScreenshot(driver, 'settings-loaded')
  })

  // 主页现在只有入口行，原先就地展开的分组各自成页——逐条确认路由真的可达。
  test.each([
    '/settings/appearance',
    '/settings/playback',
    '/settings/data',
    '/settings/about',
    '/settings/diagnostics',
  ])('导航到 %s', async (route) => {
    await driver.evaluateJS(`
      globalThis.__E2E_ROUTER__?.navigate({ to: '${route}' })
    `)
    await driver.sleep(500)

    const currentPath = await driver.evaluateJS<string>(`
      globalThis.__E2E_ROUTER__?.state?.location?.pathname ?? 'unknown'
    `)
    expect(currentPath).toBe(route)
  })

  // 截图是唯一能发现「卡片内缩与主列表不一致」的手段——状态断言对布局永远全绿。
  test('二级页渲染留档（卡片内缩需目视比对主列表）', async () => {
    await driver.evaluateJS(`
      globalThis.__E2E_ROUTER__?.navigate({ to: '/settings/appearance' })
    `)
    await driver.sleep(500)
    await stepScreenshot(driver, 'settings-appearance')

    await driver.evaluateJS(`
      globalThis.__E2E_ROUTER__?.navigate({ to: '/settings/playback' })
    `)
    await driver.sleep(500)
    await stepScreenshot(driver, 'settings-playback')
  })

  // 均衡器已不属于设置页——入口只在播放器 `⋯` 菜单，页面是 `/player/eq`。
  // 它的导航与 store 用例都在 `player-equalizer.scenario.ts`。

  test('导航到服务器设置', async () => {
    await driver.evaluateJS(`
      globalThis.__E2E_ROUTER__?.navigate({ to: '/settings/servers' })
    `)
    await driver.sleep(500)

    const currentPath = await driver.evaluateJS<string>(`
      globalThis.__E2E_ROUTER__?.state?.location?.pathname ?? 'unknown'
    `)
    expect(currentPath).toBe('/settings/servers')
  })

  test('服务器 store 存在', async () => {
    const hasServerStore = await driver.evaluateJS<boolean>(`
      typeof globalThis.__E2E_SERVER_STORE__ !== 'undefined'
    `)
    expect(hasServerStore).toBe(true)

    const profiles = await driver.evaluateJS<any[]>(`
      globalThis.__E2E_SERVER_STORE__.getState().profiles ?? []
    `)
    expect(Array.isArray(profiles)).toBe(true)
  })

  test('登出流程', async () => {
    await driver.evaluateJS(`
      globalThis.__E2E_ROUTER__?.navigate({ to: '/settings' })
    `)
    await driver.sleep(500)

    // Perform logout
    await driver.evaluateJS(`
      (async () => {
        await globalThis.__E2E_AUTH_STORE__.getState().logout();
      })()
    `)
    await driver.sleep(500)

    const status = await driver.evaluateJS<string>(`
      globalThis.__E2E_AUTH_STORE__.getState().status
    `)
    expect(status).toBe('unauthenticated')
    await stepScreenshot(driver, 'settings-logged-out')

    // Re-login for subsequent tests
    await driver.login('admin', 'admin')
  })
})
