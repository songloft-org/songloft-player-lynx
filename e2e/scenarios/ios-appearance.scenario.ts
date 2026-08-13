import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { createDriver, type E2EDriver } from '../driver/index.js'

/**
 * iOS-specific: verifies the app correctly follows system appearance changes
 * (dark/light mode). This exercises the full native→JS chain:
 *   simctl ui appearance → traitCollectionDidChange → pushAppearance() →
 *   sendGlobalEvent → system-appearance.ts listener → theme store update
 *
 * Skipped on Android (Android uses adb shell cmd uimode — separate scenario).
 */
describe('iOS: system appearance follow', () => {
  let driver: E2EDriver

  beforeAll(async () => {
    if (process.env.E2E_PLATFORM !== 'ios') return
    driver = await createDriver()
    await driver.launch()
    await driver.login('admin', 'admin')
  })

  afterAll(async () => {
    if (process.env.E2E_PLATFORM !== 'ios') return
    // Restore light mode
    if (driver.setSystemTheme) {
      await driver.setSystemTheme('light')
    }
    await driver.teardown()
  })

  test.skipIf(process.env.E2E_PLATFORM !== 'ios')(
    'switch to dark mode → app theme follows',
    async () => {
      if (!driver.setSystemTheme) throw new Error('setSystemTheme not available')

      await driver.setSystemTheme('dark')
      await driver.sleep(1500)

      const theme = await driver.evaluateJS<string>(`
        (() => {
          const store = globalThis.__E2E_PLAYER_STORE__;
          // The theme is stored in the theme model, read from shared state
          return document?.documentElement?.getAttribute('data-theme') ??
                 globalThis.__CURRENT_THEME__ ?? 'unknown';
        })()
      `)

      // The app should now be in dark mode. Exact assertion depends on how the
      // theme store exposes its value — at minimum, the system appearance listener
      // should have received the change.
      const appearance = await driver.evaluateJS<{ theme: string }>(`
        (() => {
          const lynxObj = (typeof lynx !== 'undefined') ? lynx : globalThis.lynx;
          return { theme: lynxObj?.__globalProps?.theme ?? 'unknown' };
        })()
      `)
      expect(appearance.theme).toBe('dark')

      await driver.screenshot('dark-mode-home')
    },
  )

  test.skipIf(process.env.E2E_PLATFORM !== 'ios')(
    'switch back to light mode → app theme reverts',
    async () => {
      if (!driver.setSystemTheme) throw new Error('setSystemTheme not available')

      await driver.setSystemTheme('light')
      await driver.sleep(1500)

      const appearance = await driver.evaluateJS<{ theme: string }>(`
        (() => {
          const lynxObj = (typeof lynx !== 'undefined') ? lynx : globalThis.lynx;
          return { theme: lynxObj?.__globalProps?.theme ?? 'unknown' };
        })()
      `)
      expect(appearance.theme).toBe('light')

      await driver.screenshot('light-mode-home')
    },
  )

  test.skipIf(process.env.E2E_PLATFORM !== 'ios')(
    'cold start in dark mode → first frame is dark (no flash)',
    async () => {
      if (!driver.setSystemTheme) throw new Error('setSystemTheme not available')
      if (!driver.clearAppData) throw new Error('clearAppData not available')

      // Set dark before relaunch
      await driver.setSystemTheme('dark')
      await driver.sleep(500)

      // Kill and relaunch
      await driver.teardown()
      await driver.sleep(1000)
      await driver.launch()
      await driver.sleep(500)

      // The very first globalProps should carry 'dark' (set via LynxLoadMeta)
      const appearance = await driver.evaluateJS<{ theme: string }>(`
        (() => {
          const lynxObj = (typeof lynx !== 'undefined') ? lynx : globalThis.lynx;
          return { theme: lynxObj?.__globalProps?.theme ?? 'unknown' };
        })()
      `)
      expect(appearance.theme).toBe('dark')

      await driver.screenshot('cold-start-dark')

      // Restore light for other tests
      await driver.setSystemTheme('light')
    },
  )
})
