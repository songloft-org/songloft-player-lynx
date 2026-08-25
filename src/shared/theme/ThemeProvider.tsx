import { useEffect, useState } from '@lynx-js/react'
import type { ReactNode } from '@lynx-js/react'
import type { CSSProperties } from '@lynx-js/types/common'

import { getAppTheme, resolveTheme, subscribeAppTheme } from './theme-model.js'
import { getActiveThemePack, subscribeActiveThemePack } from './theme-pack-model.js'
import { themePackToStyleVars } from './theme-pack-mapping.js'
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
 *
 * When an active theme pack exists (`theme-pack-model.ts`, fetched from the
 * server after login), its mapping lands as **inline** custom properties on
 * this same root view — inline beats the class declarations, so the pack
 * overrides exactly the tokens it maps and the Muse baseline keeps the rest
 * (see `theme-pack-mapping.ts` for the field→token table). The mapping always
 * emits the full overridable key set with valid values (baseline where the
 * pack has nothing), because the runtime's style diffs merge and never remove
 * properties — a dropped attribute would leave stale pack colours behind.
 */
export function ThemeProvider({ children }: ThemeProviderProps) {
  const [theme, setTheme] = useState(() => resolveTheme(getAppTheme()))
  const [pack, setPack] = useState(() => getActiveThemePack())

  useEffect(
    () => subscribeAppTheme(() => setTheme(resolveTheme(getAppTheme()))),
    [],
  )

  // The pack arrives asynchronously (server round-trip after auth). Keeping a
  // live copy in state — not reading the model during render — is what makes
  // activation recolor the whole tree in place.
  useEffect(
    () => subscribeActiveThemePack(() => setPack(getActiveThemePack())),
    [],
  )

  const vars = themePackToStyleVars(pack?.data, theme)
  // Lynx supports `--*` keys in the style attribute (its docs show exactly
  // this), but the bundled `CSSProperties` type predates custom-property keys,
  // hence the widening cast.
  const style = vars as (Record<string, string> & CSSProperties) | undefined

  return <view className={`theme-root theme-${theme}`} style={style}>{children}</view>
}
