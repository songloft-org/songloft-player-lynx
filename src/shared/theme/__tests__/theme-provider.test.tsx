import '@testing-library/jest-dom'
import { act, render } from '@lynx-js/react/testing-library'
import { afterEach, expect, test } from 'vitest'

import {
  applySystemAppearance,
  setSystemAppearanceForTests,
} from '../../../native/system-appearance.js'
import { createMemoryStorage } from '../../../core/storage/index.js'
import { changeAppTheme, DEFAULT_RESOLVED_THEME } from '../theme-model.js'
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
 */
function themeClass(container: { children?: unknown }): string {
  const root = (container as unknown as { firstElementChild?: { className?: string } })
    .firstElementChild
  return root?.className ?? ''
}

afterEach(() => {
  setSystemAppearanceForTests(null)
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
