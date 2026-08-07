import type { ReactNode } from '@lynx-js/react'

import './tokens.css'

export interface ThemeProviderProps {
  children?: ReactNode
}

/**
 * Injects the LUNA-style design tokens by mounting a root `<view>` carrying the
 * `theme-root` class (which declares all CSS custom properties). Everything
 * rendered inside inherits the token variables and base surface/content colors.
 */
export function ThemeProvider({ children }: ThemeProviderProps) {
  return <view className='theme-root'>{children}</view>
}
