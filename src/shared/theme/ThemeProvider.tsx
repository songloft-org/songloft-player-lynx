import { useEffect, useState } from '@lynx-js/react'
import type { ReactNode } from '@lynx-js/react'
import type { CSSProperties } from '@lynx-js/types/common'

import {
  getFontScaleNumber,
  subscribeFontScale,
} from './font-scale-model.js'
import {
  getMaterialVariant,
  subscribeMaterialVariant,
} from './material-model.js'
import {
  getSafeAreaInsets,
  safeAreaStyleVars,
  subscribeSafeArea,
} from '../../native/safe-area.js'
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
 *
 * The host-reported **safe-area insets** ride the same inline-vars channel, and for
 * the same reason it works: inline beats the class declarations, so the measured
 * `--safe-top` / `--safe-bottom` / `--safe-left` / `--safe-right` win over
 * `tokens.css`'s `env(safe-area-inset-*)` defaults on the hosts that report them
 * (iOS, where `env()` resolves to zero — see `native/safe-area.ts`) and leave those
 * defaults alone on the hosts that do not (Web). This is the right layer for it:
 * the tokens are declared on this element, `/player` and every root-mounted overlay
 * live inside it but outside `ShellLayout`, and it already re-renders on host pushes.
 */
export function ThemeProvider({ children }: ThemeProviderProps) {
  const [theme, setTheme] = useState(() => resolveTheme(getAppTheme()))
  const [pack, setPack] = useState(() => getActiveThemePack())
  const [, setMaterial] = useState(() => getMaterialVariant())
  const [, setFontScale] = useState(() => getFontScaleNumber())
  const [insets, setInsets] = useState(() => getSafeAreaInsets())

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

  useEffect(
    () => subscribeMaterialVariant(() => setMaterial(getMaterialVariant())),
    [],
  )

  useEffect(
    () => subscribeFontScale(() => setFontScale(getFontScaleNumber())),
    [],
  )

  // Rotation, and on iOS the very first resolved layout — the host pushes insets
  // whenever they move (see `ViewController.pushSafeArea`).
  useEffect(
    () => subscribeSafeArea(() => setInsets(getSafeAreaInsets())),
    [],
  )

  const vars = { ...themePackToStyleVars(pack?.data, theme), ...safeAreaStyleVars(insets) }
  const style = vars as Record<string, string> & CSSProperties

  return <view className={`theme-root theme-${theme}`} style={style}>{children}</view>
}
