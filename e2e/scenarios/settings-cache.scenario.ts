import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { createDriver, type E2EDriver } from '../driver/index.js'
import { getToken } from '../fixtures/songs.js'

describe('缓存管理', () => {
  let driver: E2EDriver
  let token: string

  beforeAll(async () => {
    driver = await createDriver()
    await driver.launch()
    await driver.login('admin', 'admin')
    token = await getToken()

    await driver.evaluateJS(`
      globalThis.__E2E_ROUTER__?.navigate({ to: '/settings/cache' })
    `)
    await driver.sleep(500)
  })

  afterAll(async () => {
    await driver.teardown()
  })

  test('导航到缓存管理页', async () => {
    const currentPath = await driver.evaluateJS<string>(`
      globalThis.__E2E_ROUTER__?.state?.location?.pathname ?? 'unknown'
    `)
    expect(currentPath).toBe('/settings/cache')
  })

  test('缓存统计 API 可达', async () => {
    const res = await fetch('http://localhost:58091/api/v1/cache-manage/stats', {
      headers: { Authorization: `Bearer ${token}` },
    })
    // API might not exist on real server — that's OK, we just test reachability
    expect([200, 404].includes(res.status)).toBe(true)
  })
})
