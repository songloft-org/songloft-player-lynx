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

  test('导航到均衡器子页', async () => {
    await driver.evaluateJS(`
      globalThis.__E2E_ROUTER__?.navigate({ to: '/settings/eq' })
    `)
    await driver.sleep(500)

    const currentPath = await driver.evaluateJS<string>(`
      globalThis.__E2E_ROUTER__?.state?.location?.pathname ?? 'unknown'
    `)
    expect(currentPath).toBe('/settings/eq')
    await stepScreenshot(driver, 'settings-eq')
  })

  test('均衡器 store 操作', async () => {
    const hasEqStore = await driver.evaluateJS<boolean>(`
      typeof globalThis.__E2E_EQ_STORE__ !== 'undefined'
    `)
    expect(hasEqStore).toBe(true)

    // Toggle EQ on
    await driver.evaluateJS(`
      globalThis.__E2E_EQ_STORE__.getState().toggle()
    `)
    await driver.sleep(200)

    const enabled = await driver.evaluateJS<boolean>(`
      globalThis.__E2E_EQ_STORE__.getState().enabled
    `)
    expect(typeof enabled).toBe('boolean')

    // Reset EQ
    await driver.evaluateJS(`
      globalThis.__E2E_EQ_STORE__.getState().reset()
    `)
    await driver.sleep(200)
  })

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
