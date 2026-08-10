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
 */
export function ThemeProvider({ children }: ThemeProviderProps) {
  const [theme, setTheme] = useState(getAppTheme)

  useEffect(() => subscribeAppTheme(() => setTheme(getAppTheme())), [])

  return (
    <view className={`theme-root theme-${resolveTheme(theme)}`}>{children}</view>
  )
}
