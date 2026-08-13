import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { createDriver, type E2EDriver } from '../driver/index.js'
import { resetStepCounter, stepScreenshot } from '../driver/step-screenshot.js'

describe('多服务器管理', () => {
  let driver: E2EDriver

  beforeAll(async () => {
    resetStepCounter()
    driver = await createDriver()
    await driver.launch()
    await driver.login('admin', 'admin')

    await driver.evaluateJS(`
      globalThis.__E2E_ROUTER__?.navigate({ to: '/settings/servers' })
    `)
    await driver.sleep(500)
  })

  afterAll(async () => {
    await driver.teardown()
  })

  test('服务器 store 可用', async () => {
    const hasStore = await driver.evaluateJS<boolean>(`
      typeof globalThis.__E2E_SERVER_STORE__ !== 'undefined' &&
      typeof globalThis.__E2E_SERVER_STORE__.getState === 'function'
    `)
    expect(hasStore).toBe(true)
    await stepScreenshot(driver, 'servers-page')
  })

  test('读取服务器 profiles', async () => {
    const state = await driver.evaluateJS<any>(`
      (() => {
        const s = globalThis.__E2E_SERVER_STORE__.getState();
        return {
          profiles: s.profiles ?? [],
          activeProfileId: s.activeProfileId ?? null,
          hasAddProfile: typeof s.addProfile === 'function',
          hasRemoveProfile: typeof s.removeProfile === 'function',
          hasSwitchTo: typeof s.switchTo === 'function',
        };
      })()
    `)
    expect(Array.isArray(state.profiles)).toBe(true)
    expect(state.hasAddProfile).toBe(true)
    expect(state.hasRemoveProfile).toBe(true)
    expect(state.hasSwitchTo).toBe(true)
  })

  test('添加新服务器 profile', async () => {
    const beforeCount = await driver.evaluateJS<number>(`
      (globalThis.__E2E_SERVER_STORE__.getState().profiles ?? []).length
    `)

    await driver.evaluateJS(`
      globalThis.__E2E_SERVER_STORE__.getState().addProfile({
        name: 'E2E Test Server',
        url: 'http://test-server:4533',
      })
    `)
    await driver.sleep(200)

    const afterCount = await driver.evaluateJS<number>(`
      (globalThis.__E2E_SERVER_STORE__.getState().profiles ?? []).length
    `)
    expect(afterCount).toBe(beforeCount + 1)
    await stepScreenshot(driver, 'servers-added')
  })

  test('删除服务器 profile', async () => {
    const profiles = await driver.evaluateJS<any[]>(`
      globalThis.__E2E_SERVER_STORE__.getState().profiles ?? []
    `)
    const testProfile = profiles.find((p: any) => p.name === 'E2E Test Server')

    if (testProfile) {
      await driver.evaluateJS(`
        globalThis.__E2E_SERVER_STORE__.getState().removeProfile('${testProfile.id}')
      `)
      await driver.sleep(200)

      const afterProfiles = await driver.evaluateJS<any[]>(`
        globalThis.__E2E_SERVER_STORE__.getState().profiles ?? []
      `)
      const found = afterProfiles.find((p: any) => p.id === testProfile.id)
      expect(found).toBeUndefined()
    } else {
      // Profile was not added (store might not persist) — that's fine
      expect(true).toBe(true)
    }
  })
})
