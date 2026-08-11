import { useEffect, useState } from '@lynx-js/react'
import type { ReactNode } from '@lynx-js/react'

import { getAppTheme, resolveTheme, subscribeAppTheme } from './theme-model.js'
import './tokens.css'

export interface ThemeProviderProps {
  children?: ReactNode
}

/**
 * Injects the LUNA-style design tokens by mounting a root `<view>` carrying
 * `theme-root theme-<light|dark>` (which declares all CSS custom properties
 * for the currently resolved theme). Everything rendered inside inherits the
 * token variables and base surface/content colors, and re-renders when the
 * user switches themes in Settings (`theme-model.ts`'s `subscribeAppTheme`).
 *
 * State holds the **resolved** theme, not the `AppTheme` choice. With the choice
 * in state, a host dark-mode flip under `'system'` (batch 21) would call
 * `setTheme('system')` with an unchanged value, React would bail out of the
 * re-render, and the theme would silently never update.
 */
export function ThemeProvider({ children }: ThemeProviderProps) {
  const [theme, setTheme] = useState(() => resolveTheme(getAppTheme()))

  useEffect(
    () => subscribeAppTheme(() => setTheme(resolveTheme(getAppTheme()))),
    [],
  )

  return <view className={`theme-root theme-${theme}`}>{children}</view>
}
