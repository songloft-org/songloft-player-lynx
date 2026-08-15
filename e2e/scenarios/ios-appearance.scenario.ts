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

  /**
   * The app's own view of the appearance, read from the BTS realm.
   *
   * Reading `lynx.__globalProps`, as this scenario originally did, cannot work: the
   * eval runs in the BTS global scope, where the bare `lynx` global does not exist
   * (it lives in the bundle's module wrapper scope), so the theme came back
   * `'unknown'` even with a perfectly working host chain. `__E2E_APPEARANCE__` is
   * exposed by `src/e2e-bridge.ts` for this reason.
   *
   * `resolvedTheme` is the reading that matches this scenario's name — it is what the
   * app actually renders, so it covers the app-side resolution on top of the host→BTS
   * delivery that `systemTheme` alone would prove. `appTheme` comes along as the
   * precondition: with a user override in effect, `'system'` is never consulted and
   * the other two readings would be unrelated to each other.
   */
  async function readAppearance(): Promise<{
    systemTheme: string | null
    appTheme: string
    resolvedTheme: string
  }> {
    return driver.evaluateJS(`
      (() => {
        const a = globalThis.__E2E_APPEARANCE__;
        return {
          systemTheme: a.getSystemAppearance().theme,
          appTheme: a.getAppTheme(),
          resolvedTheme: a.resolveTheme(a.getAppTheme()),
        };
      })()
    `)
  }

  /** The device's persisted theme choice, restored in `afterAll`. */
  let savedAppTheme = 'system'

  beforeAll(async () => {
    if (process.env.E2E_PLATFORM !== 'ios') return
    driver = await createDriver()
    await driver.launch()
    await driver.login('admin', 'admin')

    // "Follows the system" is only meaningful while the user's choice IS 'system'.
    // The device carries that choice across installs, and this simulator was in fact
    // pinned to 'light' — under which the app correctly ignores the system and every
    // assertion below would be testing nothing. Set it explicitly (this also removes
    // the pref, so it survives the relaunch in the cold-start test) and put the
    // original back afterwards.
    savedAppTheme = await driver.evaluateJS<string>(`
      (() => globalThis.__E2E_APPEARANCE__.getAppTheme())()
    `)
    await driver.evaluateJS(`
      globalThis.__E2E_APPEARANCE__.changeAppTheme('system')
    `)
    await driver.sleep(300)
  })

  afterAll(async () => {
    if (process.env.E2E_PLATFORM !== 'ios') return
    await driver.evaluateJS(`
      globalThis.__E2E_APPEARANCE__.changeAppTheme(${JSON.stringify(savedAppTheme)})
    `)
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

      const appearance = await readAppearance()
      expect(appearance.appTheme).toBe('system')
      expect(appearance.systemTheme).toBe('dark')
      expect(appearance.resolvedTheme).toBe('dark')

      await driver.screenshot('dark-mode-home')
    },
  )

  test.skipIf(process.env.E2E_PLATFORM !== 'ios')(
    'switch back to light mode → app theme reverts',
    async () => {
      if (!driver.setSystemTheme) throw new Error('setSystemTheme not available')

      await driver.setSystemTheme('light')
      await driver.sleep(1500)

      const appearance = await readAppearance()
      expect(appearance.appTheme).toBe('system')
      expect(appearance.systemTheme).toBe('light')
      expect(appearance.resolvedTheme).toBe('light')

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

      // The very first `globalProps` should carry 'dark' — `system-appearance.ts`
      // reads them on startup precisely so the launch frame paints the right theme,
      // which is what makes this the no-flash assertion rather than just another
      // change-event one.
      const appearance = await readAppearance()
      expect(appearance.appTheme).toBe('system')
      expect(appearance.systemTheme).toBe('dark')
      expect(appearance.resolvedTheme).toBe('dark')

      await driver.screenshot('cold-start-dark')

      // Restore light for other tests
      await driver.setSystemTheme('light')
    },
  )
})
