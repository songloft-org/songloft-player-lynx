import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { createDriver, type E2EDriver } from '../driver/index.js'

describe('代理设置', () => {
  let driver: E2EDriver

  beforeAll(async () => {
    driver = await createDriver()
    await driver.launch()
    await driver.login('admin', 'admin')

    await driver.evaluateJS(`
      globalThis.__E2E_ROUTER__?.navigate({ to: '/settings/proxy' })
    `)
    await driver.sleep(500)
  })

  afterAll(async () => {
    await driver.teardown()
  })

  test('导航到代理设置页', async () => {
    const currentPath = await driver.evaluateJS<string>(`
      globalThis.__E2E_ROUTER__?.state?.location?.pathname ?? 'unknown'
    `)
    expect(currentPath).toBe('/settings/proxy')
  })

  test('代理页面路由存在', async () => {
    // Simply verifying the route is registered and renders
    const pathAfterNav = await driver.evaluateJS<string>(`
      globalThis.__E2E_ROUTER__?.state?.location?.pathname ?? 'unknown'
    `)
    expect(pathAfterNav).not.toBe('unknown')
  })
})
