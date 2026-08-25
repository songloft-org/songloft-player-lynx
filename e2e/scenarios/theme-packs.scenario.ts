import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { createDriver, type E2EDriver } from '../driver/index.js'
import { stepScreenshot } from '../driver/step-screenshot.js'

// 主题包已并入外观设置页（区块卡片），主题商店是独立页面
// `/settings/theme-catalog`（从卡片的「主题商店」入口行进入）。
describe('主题包（外观设置区块 + 主题商店页）', () => {
  let driver: E2EDriver

  beforeAll(async () => {
    driver = await createDriver()
    await driver.launch()
    await driver.login('admin', 'admin')
  })

  afterAll(async () => {
    await driver.teardown()
  })

  test('导航到外观设置页（主题包区块所在）', async () => {
    await driver.evaluateJS(`
      globalThis.__E2E_ROUTER__?.navigate({ to: '/settings/appearance' })
    `)
    await driver.sleep(500)

    const currentPath = await driver.evaluateJS<string>(`
      globalThis.__E2E_ROUTER__?.state?.location?.pathname ?? 'unknown'
    `)
    expect(currentPath).toBe('/settings/appearance')

    // 截图留档：主题包卡片（含「主题商店」入口行）需目视确认随页渲染。
    await stepScreenshot(driver, 'appearance-theme-packs')
  })

  test('导航到主题商店页', async () => {
    await driver.evaluateJS(`
      globalThis.__E2E_ROUTER__?.navigate({ to: '/settings/theme-catalog' })
    `)
    await driver.sleep(500)

    const currentPath = await driver.evaluateJS<string>(`
      globalThis.__E2E_ROUTER__?.state?.location?.pathname ?? 'unknown'
    `)
    expect(currentPath).toBe('/settings/theme-catalog')
    await stepScreenshot(driver, 'theme-catalog')
  })
})
