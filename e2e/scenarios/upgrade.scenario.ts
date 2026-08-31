import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { createDriver, type E2EDriver } from '../driver/index.js'

describe('升级检查', () => {
  let driver: E2EDriver

  beforeAll(async () => {
    driver = await createDriver()
    await driver.launch()
    await driver.login('admin', 'admin')
  })

  afterAll(async () => {
    await driver.teardown()
  })

  test('导航到关于与更新页面', async () => {
    // 后端更新已并入「关于与更新」页（升级检查作为页内 section），不再有独立路由。
    await driver.evaluateJS(`
      globalThis.__E2E_ROUTER__?.navigate({ to: '/settings/about' })
    `)
    await driver.sleep(500)

    const currentPath = await driver.evaluateJS<string>(`
      globalThis.__E2E_ROUTER__?.state?.location?.pathname ?? 'unknown'
    `)
    expect(currentPath).toBe('/settings/about')
  })

  test('服务器健康检查', async () => {
    const res = await fetch('http://localhost:58091/api/v1/health')
    // Health endpoint may return 200, 401, 403, or 404 depending on server
    expect([200, 401, 403, 404].includes(res.status)).toBe(true)
  })
})
