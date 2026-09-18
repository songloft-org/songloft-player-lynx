import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { createDriver, type E2EDriver } from '../driver/index.js'

/**
 * iOS-specific: the safe-area chain, end to end.
 *
 *   view.safeAreaInsets → SafeAreaInsets.snapshot → globalProps / sendGlobalEvent
 *   → native/safe-area.ts → ThemeProvider inline `--safe-*` → every page's padding
 *
 * **Why this scenario has to exist.** The stylesheets ask for
 * `env(safe-area-inset-*)`, which the Lynx CSS docs list as supported on every
 * backend. On iOS Lynx 4.0.1 it resolves to **zero** — as a direct declaration and
 * through a custom property alike — and reports nothing while doing so. Nothing
 * else in the suite can see that: the stores, the class names and the route are all
 * identical whether the insets applied or not, and the only symptom is a header
 * under the Dynamic Island. That is why the host measures and pushes the values,
 * and why this asserts BOTH halves:
 *
 *  1. what the host reported (`__E2E_SAFE_AREA__`) — proves the native channel;
 *  2. what the tree laid out to (`__E2E_MEASURE__`) — proves the CSS consumed it.
 *
 * Either alone passes while the feature is broken.
 *
 * The device is a notched/Dynamic-Island simulator (the suite's iPhone 17 Pro), so
 * a non-zero top inset is a fair expectation; the assertions are written against
 * "matches what the host reported" rather than a hardcoded 62 so they survive a
 * device change.
 *
 * Skipped off iOS: Android and HarmonyOS lay the page out below the status bar
 * already and report no insets, so there is nothing to follow there.
 */
describe('iOS: safe-area insets', () => {
  let driver: E2EDriver

  interface Insets {
    top: number | null
    bottom: number | null
    left: number | null
    right: number | null
  }

  interface Rect {
    left: number
    top: number
    width: number
    height: number
  }

  /** The insets the host pushed, as the page decoded them. */
  async function hostInsets(): Promise<Insets> {
    return driver.evaluateJS('(() => globalThis.__E2E_SAFE_AREA__.get())()')
  }

  /**
   * Measure an in-flow element. Fixed-position elements are deliberately not used
   * here: on iOS they report their height but garbage for `left`/`top`/`width`
   * (see `__E2E_MEASURE__`'s note), so the bottom chrome is asserted through the
   * scrolling page's box instead of through the nav capsule itself.
   */
  async function measure(selector: string): Promise<Rect | null> {
    return driver.evaluateJS(
      `globalThis.__E2E_MEASURE__(${JSON.stringify(selector)})`,
    )
  }

  beforeAll(async () => {
    if (process.env.E2E_PLATFORM !== 'ios') return
    driver = await createDriver()
    await driver.launch()
    await driver.login('admin', 'admin')
    // Earlier scenarios may leave the app on `/player`, `/library`, or a modal;
    // this scenario asserts geometry on `/` (the shell + home page), so return
    // there explicitly instead of assuming it's the current route.
    await driver.evaluateJS("globalThis.__E2E_ROUTER__?.navigate({ to: '/' })")
    await driver.sleep(500)
  })

  afterAll(async () => {
    if (process.env.E2E_PLATFORM !== 'ios') return
    await driver.teardown()
  })

  test.skipIf(process.env.E2E_PLATFORM !== 'ios')(
    'the host reports the four insets and the top one is non-zero',
    async () => {
      const insets = await hostInsets()

      // Not `toBeGreaterThan(0)` on each: only the top is guaranteed on every
      // simulator this can run on. `null` is the "host said nothing" sentinel and
      // is a real failure here — it means the globalProps keys or the event name
      // drifted from the Swift constants.
      expect(insets.top).not.toBeNull()
      expect(insets.bottom).not.toBeNull()
      expect(insets.left).not.toBeNull()
      expect(insets.right).not.toBeNull()
      // A notched device. If this ever runs on a pre-X simulator, the layout
      // assertion below still holds at 0 — this is the line to relax, not that one.
      expect(insets.top!).toBeGreaterThan(0)
    },
  )

  test.skipIf(process.env.E2E_PLATFORM !== 'ios')(
    'the LynxView fills the screen and the page is inset inside it',
    async () => {
      // `.shell` and `.home` are laid out after the auth-gated redirect resolves
      // to `/`. On a cold-install run this can trail the 1s login sleep by a few
      // hundred ms — measure() returns null instead of failing loudly, so poll
      // for the root box to show up before asserting its geometry.
      await driver.waitFor(async () => (await measure('.shell')) !== null, {
        timeout: 5000,
        interval: 100,
      })
      const shell = await measure('.shell')
      const page = await measure('.home')
      expect(shell).not.toBeNull()
      expect(page).not.toBeNull()

      // Full-screen viewport: the shell starts at the physical top-left. When the
      // host inset the LynxView to the safe area instead (the shape that left the
      // status-bar band painted by `view.backgroundColor`), `.shell` was still at
      // 0,0 — but shorter than the screen by top+bottom, which is what the height
      // relation below pins down.
      expect(shell!.top).toBe(0)
      expect(shell!.left).toBe(0)

      const insets = await hostInsets()
      // `.shell__body` applies `padding-top: var(--safe-top)`, so the routed page —
      // its in-flow child — starts exactly one top inset down. This is the
      // assertion that fails if `--safe-top` collapses to `env()`'s zero.
      expect(page!.top).toBe(insets.top)
      expect(page!.height).toBe(shell!.height - insets.top!)

      await driver.screenshot('safe-area-home')
    },
  )

  test.skipIf(process.env.E2E_PLATFORM !== 'ios')(
    'a chrome-less route carries its own inset',
    async () => {
      // `/player` is mounted on the root route, outside `ShellLayout`, so it gets
      // nothing from `.shell__body` and pads itself off the same tokens. It is the
      // whole class of full-screen pages (login, lyric adjust, DLNA, EQ) in one
      // check: if the tokens only reached the shell, this is what would catch it.
      await driver.evaluateJS("globalThis.__E2E_ROUTER__.navigate({ to: '/player' })")
      await driver.sleep(800)

      const insets = await hostInsets()
      const player = await measure('.full-player')
      expect(player).not.toBeNull()
      // `padding-top: calc(var(--space-4) + var(--safe-top))` — the box itself is
      // full-bleed (that is the point), so the inset shows up as padding rather
      // than as an offset. Its first child is what moves; assert the page covers
      // the full height, i.e. it was NOT inset by the host.
      expect(player!.top).toBe(0)
      expect(player!.height).toBeGreaterThan(insets.top!)

      await driver.screenshot('safe-area-player')
      await driver.evaluateJS("globalThis.__E2E_ROUTER__.navigate({ to: '/' })")
      await driver.sleep(500)
    },
  )
})
