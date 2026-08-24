import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { createDriver, type E2EDriver } from '../driver/index.js'
import { resetStepCounter, stepScreenshot } from '../driver/step-screenshot.js'

describe('均衡器', () => {
  let driver: E2EDriver

  beforeAll(async () => {
    resetStepCounter()
    driver = await createDriver()
    await driver.launch()
    await driver.login('admin', 'admin')

    await driver.evaluateJS(`
      globalThis.__E2E_ROUTER__?.navigate({ to: '/player/eq' })
    `)
    await driver.sleep(500)
  })

  afterAll(async () => {
    // Reset EQ state
    await driver.evaluateJS(`
      globalThis.__E2E_EQ_STORE__.getState().reset()
    `)
    await driver.teardown()
  })

  test('均衡器页在 /player/eq 可达', async () => {
    const currentPath = await driver.evaluateJS<string>(`
      globalThis.__E2E_ROUTER__?.state?.location?.pathname ?? 'unknown'
    `)
    expect(currentPath).toBe('/player/eq')
  })

  test('返回回到播放器，不是设置页', async () => {
    const action = await driver.evaluateJS<{ kind: string; to?: string }>(`
      globalThis.__E2E_BACK__.resolveRouteBack('/player/eq')
    `)
    expect(action.kind).toBe('navigate')
    expect(action.to).toBe('/player')
  })

  test('均衡器默认关闭', async () => {
    await driver.evaluateJS(`
      globalThis.__E2E_EQ_STORE__.getState().reset()
    `)
    await driver.sleep(200)

    const enabled = await driver.evaluateJS<boolean>(`
      globalThis.__E2E_EQ_STORE__.getState().enabled
    `)
    expect(enabled).toBe(false)
    await stepScreenshot(driver, 'eq-disabled')
  })

  test('开启均衡器', async () => {
    await driver.evaluateJS(`
      globalThis.__E2E_EQ_STORE__.getState().toggle()
    `)
    await driver.sleep(200)

    const enabled = await driver.evaluateJS<boolean>(`
      globalThis.__E2E_EQ_STORE__.getState().enabled
    `)
    expect(enabled).toBe(true)
    await stepScreenshot(driver, 'eq-enabled')
  })

  test('选择预设', async () => {
    const hasSelectPreset = await driver.evaluateJS<boolean>(`
      typeof globalThis.__E2E_EQ_STORE__.getState().selectPreset === 'function'
    `)
    expect(hasSelectPreset).toBe(true)

    await driver.evaluateJS(`
      globalThis.__E2E_EQ_STORE__.getState().selectPreset('rock')
    `)
    await driver.sleep(200)

    const preset = await driver.evaluateJS<string>(`
      globalThis.__E2E_EQ_STORE__.getState().activePreset ?? ''
    `)
    expect(preset).toBe('rock')
    await stepScreenshot(driver, 'eq-preset-rock')
  })

  test('手动调节频段 → 预设变为 custom', async () => {
    const hasAdjustBand = await driver.evaluateJS<boolean>(`
      typeof globalThis.__E2E_EQ_STORE__.getState().adjustBand === 'function'
    `)
    expect(hasAdjustBand).toBe(true)

    await driver.evaluateJS(`
      globalThis.__E2E_EQ_STORE__.getState().adjustBand(0, 5)
    `)
    await driver.sleep(200)

    const preset = await driver.evaluateJS<string>(`
      globalThis.__E2E_EQ_STORE__.getState().activePreset ?? ''
    `)
    expect(preset).toBe('custom')
  })

  test('重置均衡器', async () => {
    await driver.evaluateJS(`
      globalThis.__E2E_EQ_STORE__.getState().reset()
    `)
    await driver.sleep(200)

    const state = await driver.evaluateJS<{ enabled: boolean; activePreset: string }>(`
      (() => {
        const s = globalThis.__E2E_EQ_STORE__.getState();
        return { enabled: s.enabled, activePreset: s.activePreset ?? '' };
      })()
    `)
    expect(state.enabled).toBe(false)
    await stepScreenshot(driver, 'eq-reset')
  })
})
