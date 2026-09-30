import type { ThemePackData } from '../../../shared/theme/theme-pack-mapping.js'
import { PACK_OVERRIDABLE_BASELINE } from '../../../shared/theme/theme-pack-mapping.js'
import { MATERIAL_TOKENS } from '../../../shared/theme/material-tokens.js'
import { getMaterialVariant } from '../../../shared/theme/material-model.js'
import type { ResolvedTheme } from '../../../shared/theme/theme-model.js'

/**
 * The `appearance` half of the `songloft-theme` push — the non-colour visual
 * parameters a plugin page cannot derive from light/dark alone. The WebView
 * SDK's `common.js` consumes it: `navigationStyle` becomes the
 * `data-navigation-style` attribute, the radii become `--sl-theme-*-radius`,
 * and the glass pair becomes `--sl-theme-glass-fill` / `--sl-theme-glass-border`
 * (an invalid colour is dropped there, not here — the plugin falls back to its
 * own M3 roles).
 *
 * The Flutter build's `pluginThemeAppearanceMap` (plugin_color_scheme.dart) is
 * the contract's other half: same field names, same camelCase. The values here
 * come from THIS client's own token tables, not a copy of Flutter's — the two
 * clients theme differently (Material tonal vs HIG semantic), and a plugin
 * asking "what does my host's chrome look like" should get this host's answer.
 *
 * `navigationStyle` is **constant `'capsule'`**: this client's bottom nav is a
 * fixed capsule and its mini-player is a floating capsule — there is no
 * standard edge-to-edge layout to mirror (`theme-pack-mapping.ts` keeps the
 * pack field unread for the same reason). The pack's `navigationStyle: 'standard'`
 * would say the *Flutter* host wears a bar; it cannot change what this host
 * actually renders.
 *
 * `playerGradient` is deliberately absent: the Lynx player renders a scrim
 * veil over the blurred cover, not a gradient, and `player-backdrop-css.test`
 * holds that line — pushing a gradient string would be dead data at best.
 */
export interface PluginThemeAppearance {
  navigationStyle: 'capsule'
  cardRadius: number
  controlRadius: number
  navigationRadius: number
  glassFill: string
  glassBorder: string
}

/** Radius clamped to the pack schema's own 0–100 range (mirrors radiusVar). */
function clampRadius(value: number | undefined, fallback: number): number {
  if (value == null || Number.isNaN(value) || value < 0 || value > 100) return fallback
  return value
}

/** `"20px"` → `20`; anything else → the fallback. */
function pxToNumber(value: string, fallback: number): number {
  const n = Number(value.slice(0, -2))
  return Number.isFinite(n) ? n : fallback
}

/**
 * The appearance payload for the resolved theme. `pack` may be null (no pack /
 * not yet fetched) — the baseline radii and the current material variant's
 * glass still apply, because the host chrome exists regardless of any pack.
 */
export function pluginThemeAppearance(
  pack: ThemePackData | null | undefined,
  resolved: ResolvedTheme,
): PluginThemeAppearance {
  const baseline = PACK_OVERRIDABLE_BASELINE[resolved]
  const material = MATERIAL_TOKENS[getMaterialVariant()][resolved]
  return {
    navigationStyle: 'capsule',
    cardRadius: clampRadius(pack?.cardRadius, pxToNumber(baseline['--radius-lg'], 20)),
    controlRadius: clampRadius(pack?.controlRadius, pxToNumber(baseline['--radius-md'], 12)),
    navigationRadius: clampRadius(pack?.navigationRadius, pxToNumber(baseline['--radius-nav'], 12)),
    glassFill: material['--material-fill'],
    glassBorder: material['--material-border'],
  }
}
