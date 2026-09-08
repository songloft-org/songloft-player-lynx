import '@testing-library/jest-dom'
import { act, render } from '@lynx-js/react/testing-library'
import { afterEach, expect, test } from 'vitest'

import {
  applySystemAppearance,
  setSystemAppearanceForTests,
} from '../../../native/system-appearance.js'
import { createMemoryStorage } from '../../../core/storage/index.js'
import { changeAppTheme, DEFAULT_RESOLVED_THEME } from '../theme-model.js'
import { PACK_OVERRIDABLE_BASELINE } from '../theme-pack-mapping.js'
import { setActiveThemePack } from '../theme-pack-model.js'
import { ThemeProvider } from '../ThemeProvider.js'

/**
 * `ThemeProvider` is the only place the resolved theme becomes visible (as the
 * root `theme-<light|dark>` class), so it is the only place the "follow the
 * system" wiring can be proven end to end.
 *
 * The trap this file exists for: with the `AppTheme` *choice* in component state
 * (`useState(getAppTheme)`, as it was before batch 21), a host dark-mode flip
 * under `'system'` calls `setTheme('system')` with an unchanged value, React
 * bails out, and the class never updates — the model would be perfectly correct
 * and the UI would still never follow the system.
 *
 * Theme packs add the same class of trap one level up: the pack arrives from a
 * server round-trip *after* mount, so the provider must subscribe to it — a
 * render-time read would freeze the first (pack-less) frame forever.
 */
function themeClass(container: { children?: unknown }): string {
  const root = (container as unknown as { firstElementChild?: { className?: string } })
    .firstElementChild
  return root?.className ?? ''
}

function rootStyle(container: { children?: unknown }): Record<string, string> {
  const root = (container as unknown as {
    firstElementChild?: { style?: Record<string, string> }
  }).firstElementChild
  return root?.style ?? {}
}

afterEach(() => {
  setSystemAppearanceForTests(null)
  setActiveThemePack(null)
})

test('renders the host theme when the choice is system', async () => {
  setSystemAppearanceForTests({ theme: 'light', locale: null })
  await changeAppTheme('system', createMemoryStorage())

  const { container } = render(<ThemeProvider />)

  expect(themeClass(container)).toContain('theme-light')
})

test('a host flip re-renders the root class while the choice is system', async () => {
  setSystemAppearanceForTests({ theme: 'dark', locale: null })
  await changeAppTheme('system', createMemoryStorage())

  const { container } = render(<ThemeProvider />)
  expect(themeClass(container)).toContain('theme-dark')

  await act(async () => {
    applySystemAppearance({ theme: 'light', locale: null })
  })

  expect(themeClass(container)).toContain('theme-light')
  expect(themeClass(container)).not.toContain('theme-dark')
})

test('an explicit choice wins over the host', async () => {
  setSystemAppearanceForTests({ theme: 'light', locale: null })
  await changeAppTheme('dark', createMemoryStorage())

  const { container } = render(<ThemeProvider />)

  expect(themeClass(container)).toContain('theme-dark')
})

test('falls back when the host reports no theme at all', async () => {
  setSystemAppearanceForTests({ theme: null, locale: null })
  await changeAppTheme('system', createMemoryStorage())

  const { container } = render(<ThemeProvider />)

  expect(themeClass(container)).toContain(`theme-${DEFAULT_RESOLVED_THEME}`)
})

/* ── Theme-pack delivery ────────────────────────────────────────────────────── */

const SAKURA = {
  themeId: 'songloft.sakura',
  data: {
    id: 'songloft.sakura',
    name: 'Sakura',
    author: 'Songloft',
    description: '',
    version: '1.0.0',
    schemaVersion: 1,
    light: { seedColor: '#D81B60', backgroundColor: '#FFF0F5', surfaceColor: '#FFFFFF' },
    dark: { seedColor: '#F48FB1', backgroundColor: '#1A0A10', surfaceColor: '#261418' },
    cardRadius: 14,
    controlRadius: 16,
    navigationRadius: 14,
  },
}


/** Expected inline style when no pack is active — baseline + --font-scale (default 1). */
function expectBaselineStyle(resolved: 'light' | 'dark'): Record<string, string> {
  return {
    ...PACK_OVERRIDABLE_BASELINE[resolved],
    '--font-scale': '1',
    // The test host reports `SystemInfo.platform === 'ios'` and no insets, so
    // safe-area edges are pinned to 0 on native (see safe-area.test.ts) and land
    // here as valid inline `0px` instead of the broken stylesheet `env()` default.
    '--safe-top': '0px',
    '--safe-bottom': '0px',
    '--safe-left': '0px',
    '--safe-right': '0px',
  }
}

test('without a pack the root inline tokens equal the Muse baseline', async () => {
  setSystemAppearanceForTests({ theme: 'light', locale: null })
  await changeAppTheme('system', createMemoryStorage())

  const { container } = render(<ThemeProvider />)

  // The runtime merges style objects and never removes keys, so the provider
  // cannot drop the attribute on "no pack" — it writes the baseline instead.
  // Inline equals the class declarations, so the rendered look is unchanged.
  expect(rootStyle(container)).toEqual(expectBaselineStyle('light'))
})

test('an active pack lands as inline custom properties on the root', async () => {
  setSystemAppearanceForTests({ theme: 'light', locale: null })
  await changeAppTheme('system', createMemoryStorage())
  setActiveThemePack(SAKURA)

  const { container } = render(<ThemeProvider />)

  const style = rootStyle(container)
  expect(themeClass(container)).toContain('theme-light')
  expect(style['--accent']).toBe('#D81B60')
  expect(style['--system-background']).toBe('#FFF0F5')
  expect(style['--secondary-system-background']).toBe('#FFFFFF')
  expect(style['--radius-nav']).toBe('14px')
})

test('a pack arriving after mount recolors the tree in place', async () => {
  // The real sequence: mount (still fetching) → server answers → subscribe
  // fires. A provider that only read the model at render time would stay
  // pack-less forever.
  setSystemAppearanceForTests({ theme: 'light', locale: null })
  await changeAppTheme('system', createMemoryStorage())

  const { container } = render(<ThemeProvider />)
  expect(rootStyle(container)).toEqual(expectBaselineStyle('light'))

  await act(async () => {
    setActiveThemePack(SAKURA)
  })

  expect(rootStyle(container)['--accent']).toBe('#D81B60')
})

test('the pack follows the resolved theme when it flips', async () => {
  setSystemAppearanceForTests({ theme: 'light', locale: null })
  await changeAppTheme('system', createMemoryStorage())
  setActiveThemePack(SAKURA)

  const { container } = render(<ThemeProvider />)
  expect(rootStyle(container)['--accent']).toBe('#D81B60')

  await act(async () => {
    applySystemAppearance({ theme: 'dark', locale: null })
  })

  expect(themeClass(container)).toContain('theme-dark')
  expect(rootStyle(container)['--accent']).toBe('#F48FB1')
  expect(rootStyle(container)['--system-background']).toBe('#1A0A10')
})

test('clearing the pack writes the baseline back over the pack colours', async () => {
  setSystemAppearanceForTests({ theme: 'light', locale: null })
  await changeAppTheme('system', createMemoryStorage())
  setActiveThemePack(SAKURA)

  const { container } = render(<ThemeProvider />)
  expect(rootStyle(container)['--accent']).toBe('#D81B60')

  await act(async () => {
    setActiveThemePack(null)
  })

  // Regression shape: the runtime does NOT remove style-object keys, so a
  // dropped attribute would leave the sakura pink on screen forever.
  expect(rootStyle(container)).toEqual(expectBaselineStyle('light'))
  expect(rootStyle(container)['--accent']).toBe('#0088ff')
})
