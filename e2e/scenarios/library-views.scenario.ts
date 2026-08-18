import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { createDriver, type E2EDriver } from '../driver/index.js'
import { resetStepCounter, stepScreenshot } from '../driver/step-screenshot.js'

/**
 * 曲库 14 视图：三路分发的真机冒烟。
 *
 * 单测只能证明「调了哪个 hook」；这里经 `__E2E_ROUTER__` 依次落到三种内容
 * （扁平歌曲 / 分类网格 / 歌单卡片）各截一张图，证明它们在真机上真的渲染。
 * 断言刻意保守——只查路由落点（e2e bridge 不暴露 query cache，配置持久化走
 * 手动验收：改视图 → 杀进程 → 重进曲库）。
 */
describe('曲库：14 视图三路分发', () => {
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

  async function goTo(view: string) {
    await driver.evaluateJS(`
      globalThis.__E2E_ROUTER__?.navigate({ to: '/library', search: { view: '${view}' } })
    `)
    await driver.sleep(800)
    return driver.evaluateJS<string>(`
      globalThis.__E2E_ROUTER__?.state?.location?.pathname ?? 'unknown'
    `)
  }

  test('扁平歌曲视图（all）', async () => {
    expect(await goTo('all')).toBe('/library')
    await stepScreenshot(driver, 'library-view-all')
  })

  test('分类网格视图（artist）', async () => {
    expect(await goTo('artist')).toBe('/library')
    await stepScreenshot(driver, 'library-view-artist')
  })

  test('歌单卡片视图（playlist_radio）', async () => {
    expect(await goTo('playlist_radio')).toBe('/library')
    await stepScreenshot(driver, 'library-view-playlist-radio')
  })

  test('旧 ?view=songs 深链接迁移到 all 而不报错', async () => {
    // Legacy four-tab values are migrated, not rejected — a stale deep link
    // must land on the library, not bounce.
    expect(await goTo('songs')).toBe('/library')
  })
})
