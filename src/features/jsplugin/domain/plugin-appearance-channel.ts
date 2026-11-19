import { getAppTheme, resolveTheme, subscribeAppTheme } from '../../../shared/theme/theme-model.js'
import { getActiveThemePack, subscribeActiveThemePack } from '../../../shared/theme/theme-pack-model.js'
import { getBuiltInPalette, subscribeBuiltInPalette } from '../../../shared/theme/built-in-palette-model.js'
import { subscribeSurfacePolicy } from '../../../shared/theme/surface-policy.js'
import { subscribeMaterialVariant } from '../../../shared/theme/material-model.js'
import { pluginColorSchemeMap } from './plugin-color-scheme.js'
import { pluginThemeAppearance } from './plugin-theme-appearance.js'

export function buildThemeMessage() {
  const theme = resolveTheme(getAppTheme()), pack = getActiveThemePack()?.data
  return { type: 'songloft-theme' as const, theme, colors: pluginColorSchemeMap(pack, theme, getBuiltInPalette()), appearance: pluginThemeAppearance(pack, theme) }
}
export function subscribePluginAppearance(push: () => void): () => void {
  const stops = [subscribeAppTheme(push), subscribeActiveThemePack(push), subscribeBuiltInPalette(push), subscribeSurfacePolicy(push), subscribeMaterialVariant(push)]
  return () => stops.forEach(stop => stop())
}
