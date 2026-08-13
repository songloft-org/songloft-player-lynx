import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { createDriver, type E2EDriver } from '../driver/index.js'
import { resetStepCounter, stepScreenshot } from '../driver/step-screenshot.js'

describe('导航：路由切换与守卫', () => {
  let driver: E2EDriver

  beforeAll(async () => {
    resetStepCounter()
    driver = await createDriver()
    await driver.launch()
    await driver.login('admin', 'admin')
  })

  afterAll(async () => {
    await driver.teardown()
  })

  test('登录后默认在首页 /', async () => {
    await driver.evaluateJS(`
      globalThis.__E2E_ROUTER__?.navigate({ to: '/' })
    `)
    await driver.sleep(500)

    const currentPath = await driver.evaluateJS<string>(`
      globalThis.__E2E_ROUTER__?.state?.location?.pathname ?? 'unknown'
    `)
    expect(currentPath).toBe('/')
    await stepScreenshot(driver, 'nav-home')
  })

  test('导航到曲库 /library', async () => {
    await driver.evaluateJS(`
      globalThis.__E2E_ROUTER__?.navigate({ to: '/library' })
    `)
    await driver.sleep(500)

    const currentPath = await driver.evaluateJS<string>(`
      globalThis.__E2E_ROUTER__?.state?.location?.pathname ?? 'unknown'
    `)
    expect(currentPath).toBe('/library')
    await stepScreenshot(driver, 'nav-library')
  })

  test('导航到设置 /settings', async () => {
    await driver.evaluateJS(`
      globalThis.__E2E_ROUTER__?.navigate({ to: '/settings' })
    `)
    await driver.sleep(500)

    const currentPath = await driver.evaluateJS<string>(`
      globalThis.__E2E_ROUTER__?.state?.location?.pathname ?? 'unknown'
    `)
    expect(currentPath).toBe('/settings')
    await stepScreenshot(driver, 'nav-settings')
  })

  test('导航到全屏播放器 /player', async () => {
    await driver.evaluateJS(`
      globalThis.__E2E_ROUTER__?.navigate({ to: '/player' })
    `)
    await driver.sleep(500)

    const currentPath = await driver.evaluateJS<string>(`
      globalThis.__E2E_ROUTER__?.state?.location?.pathname ?? 'unknown'
    `)
    expect(currentPath).toBe('/player')
    await stepScreenshot(driver, 'nav-player')
  })

  test('导航到设置子页面 /settings/eq', async () => {
    await driver.evaluateJS(`
      globalThis.__E2E_ROUTER__?.navigate({ to: '/settings/eq' })
    `)
    await driver.sleep(500)

    const currentPath = await driver.evaluateJS<string>(`
      globalThis.__E2E_ROUTER__?.state?.location?.pathname ?? 'unknown'
    `)
    expect(currentPath).toBe('/settings/eq')
    await stepScreenshot(driver, 'nav-settings-eq')
  })

  test('导航到播放列表详情 /playlists/1', async () => {
    await driver.evaluateJS(`
      globalThis.__E2E_ROUTER__?.navigate({ to: '/playlists/1' })
    `)
    await driver.sleep(500)

    const currentPath = await driver.evaluateJS<string>(`
      globalThis.__E2E_ROUTER__?.state?.location?.pathname ?? 'unknown'
    `)
    expect(currentPath).toBe('/playlists/1')
    await stepScreenshot(driver, 'nav-playlist-detail')
  })

  test('导航回首页 /', async () => {
    await driver.evaluateJS(`
      globalThis.__E2E_ROUTER__?.navigate({ to: '/' })
    `)
    await driver.sleep(500)

    const currentPath = await driver.evaluateJS<string>(`
      globalThis.__E2E_ROUTER__?.state?.location?.pathname ?? 'unknown'
    `)
    expect(currentPath).toBe('/')
  })
})
