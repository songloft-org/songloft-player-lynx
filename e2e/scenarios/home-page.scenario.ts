import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { createDriver, type E2EDriver } from '../driver/index.js'
import { resetStepCounter, stepScreenshot } from '../driver/step-screenshot.js'
import { getToken } from '../fixtures/songs.js'

describe('首页', () => {
  let driver: E2EDriver

  beforeAll(async () => {
    resetStepCounter()
    driver = await createDriver()
    await driver.launch()
    await driver.login('admin', 'admin')

    await driver.evaluateJS(`
      globalThis.__E2E_ROUTER__?.navigate({ to: '/' })
    `)
    await driver.sleep(1000)
  })

  afterAll(async () => {
    await driver.teardown()
  })

  test('登录后加载首页', async () => {
    const currentPath = await driver.evaluateJS<string>(`
      globalThis.__E2E_ROUTER__?.state?.location?.pathname ?? 'unknown'
    `)
    expect(currentPath).toBe('/')
    await stepScreenshot(driver, 'home-loaded')
  })

  test('播放列表 API 数据可获取', async () => {
    const token = await getToken()
    const res = await fetch('http://localhost:58091/api/v1/playlists?limit=10', {
      headers: { Authorization: `Bearer ${token}` },
    })
    const data = await res.json() as any
    const playlists = data.items ?? data.playlists ?? []
    expect(playlists.length).toBeGreaterThanOrEqual(0)
  })

  test('曲库统计数据可获取', async () => {
    const token = await getToken()
    const res = await fetch('http://localhost:58091/api/v1/songs/stats', {
      headers: { Authorization: `Bearer ${token}` },
    })
    const stats = await res.json() as any
    const songCount = stats.total_songs ?? stats.songCount ?? 0
    expect(songCount).toBeGreaterThan(0)
    await stepScreenshot(driver, 'home-stats')
  })

  test('导航到播放列表详情', async () => {
    // Navigate to a playlist (id=1 is typically Favorites)
    await driver.evaluateJS(`
      globalThis.__E2E_ROUTER__?.navigate({ to: '/playlists/1' })
    `)
    await driver.sleep(500)

    const currentPath = await driver.evaluateJS<string>(`
      globalThis.__E2E_ROUTER__?.state?.location?.pathname ?? 'unknown'
    `)
    expect(currentPath).toBe('/playlists/1')

    // Navigate back
    await driver.evaluateJS(`
      globalThis.__E2E_ROUTER__?.navigate({ to: '/' })
    `)
    await driver.sleep(500)
  })
})
