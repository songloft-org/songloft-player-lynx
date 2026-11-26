import { afterAll, assert, beforeAll, describe, expect, test } from 'vitest'

import { LIBRARY_VIEW_KEYS } from '../../src/models/library-browse.js'
import { createDriver, type E2EDriver } from '../driver/index.js'
import { resetStepCounter, stepScreenshot } from '../driver/step-screenshot.js'

/**
 * 曲库视图的原生渲染与布局回归。
 *
 * 单测只能证明「调了哪个 hook」；这里经 `__E2E_ROUTER__` 依次落到三种内容
 * （扁平歌曲 / 分类网格 / 歌单卡片）各截一张图，证明它们在真机上真的渲染。
 * 使用原生布局测量检查切换内容类型和标题栏操作时的垂直对齐。
 */
describe('曲库视图', () => {
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

  test('切换任意曲库视图时标题栏保持对齐', async () => {
    const selectors = ['.library__topbar', '.library__topbar-title', '.library__content']
    type Rect = { top: number; height: number }
    const measure = () => driver.evaluateJS<(Rect | null)[]>(`
      Promise.all(${JSON.stringify(selectors)}.map(globalThis.__E2E_MEASURE__))
    `)

    expect(await goTo('all')).toBe('/library')
    await driver.waitFor(async () => (await measure()).every(rect => rect != null && rect.height > 0))
    const initial = await measure()

    for (const view of [...LIBRARY_VIEW_KEYS.slice(1), 'all']) {
      expect(await goTo(view)).toBe('/library')
      expect(await driver.evaluateJS('globalThis.__E2E_ROUTER__.state.location.search.view')).toBe(view)
      const current = await measure()
      for (const [index, selector] of selectors.entries()) {
        const expected = initial[index]
        const actual = current[index]
        assert(expected && expected.height > 0, `all ${selector} has no layout`)
        assert(actual && actual.height > 0, `${view} ${selector} has no layout`)
        expect(Math.abs(actual.top - expected.top), `${view} ${selector} top`).toBeLessThan(1)
        expect(Math.abs(actual.height - expected.height), `${view} ${selector} height`).toBeLessThan(1)
      }
    }
  }, 90_000)

  test('旧 ?view=songs 深链接迁移到 all 而不报错', async () => {
    // Legacy four-tab values are migrated, not rejected — a stale deep link
    // must land on the library, not bounce.
    expect(await goTo('songs')).toBe('/library')
  })
})
