import { describe, expect, test } from 'vitest'

/**
 * The `colors` half of the `songloft-theme` push — the plugin SDK's
 * `common.js` writes every value as an inline `--md-*` custom property and
 * `getColorScheme()` hands the object to plugins. These tests pin the parts
 * of the contract the receiver enforces silently:
 *
 *  - every value must be `#RRGGBB` — the SDK's HEX_RE drops anything else
 *    without an error, so a `rgba()` or 3-digit hex here would strand the
 *    plugin on its static fallback with no signal anywhere;
 *  - the key set must match the SDK's `ColorScheme`-field-name contract
 *    (camelCase, exact names — `plugin_color_scheme.dart` is the naming
 *    source; a missing key leaves that token on the fallback);
 *  - a pack's `seedColor`/`backgroundColor`/`surfaceColor` move the mapped
 *    families; invalid values fall back field-by-field.
 *
 * No pack-model mocking needed: the pack data is a plain input here.
 */
import { pluginColorSchemeMap } from '../domain/plugin-color-scheme.js'

const PACK = {
  id: 'p1',
  name: 'Pack',
  author: 'a',
  description: 'd',
  version: '1',
  schemaVersion: 1,
}

const HEX_RE = /^#[0-9a-fA-F]{6}$/

const SDK_KEYS = [
  'primary', 'onPrimary', 'primaryContainer', 'onPrimaryContainer',
  'secondary', 'onSecondary', 'secondaryContainer', 'onSecondaryContainer',
  'tertiary', 'onTertiary', 'tertiaryContainer', 'onTertiaryContainer',
  'error', 'onError', 'errorContainer', 'onErrorContainer',
  'surface', 'onSurface', 'onSurfaceVariant',
  'surfaceDim', 'surfaceBright',
  'surfaceContainerLowest', 'surfaceContainerLow',
  'surfaceContainer', 'surfaceContainerHigh', 'surfaceContainerHighest',
  'outline', 'outlineVariant',
  'inverseSurface', 'onInverseSurface', 'inversePrimary',
] as const

describe('pluginColorSchemeMap', () => {
  test('every key the SDK names is present with a #RRGGBB value, both themes, with and without a pack', () => {
    for (const resolved of ['light', 'dark'] as const) {
      for (const pack of [null, PACK]) {
        const scheme = pluginColorSchemeMap(pack, resolved)
        for (const key of SDK_KEYS) {
          expect(HEX_RE.test(scheme[key]), `${resolved}/${pack ? 'pack' : 'no-pack'} ${key} = ${scheme[key]}`).toBe(true)
        }
      }
    }
  })

  test('no extra keys — a plugin reading getColorScheme() sees only the contract fields', () => {
    const scheme = pluginColorSchemeMap(null, 'light')
    expect(Object.keys(scheme).sort()).toEqual([...SDK_KEYS].sort())
  })

  test('a pack seed recolours the accent-derived family', () => {
    const pack = { ...PACK, light: { seedColor: '#e91e63' } }
    const scheme = pluginColorSchemeMap(pack, 'light')
    expect(scheme.primary).toBe('#e91e63')
    // A mid-luma seed (YIQ ≈ 99) keeps the white label.
    expect(scheme.onPrimary).toBe('#ffffff')
    // A genuinely bright seed flips it (YIQ ≥ 128).
    expect(pluginColorSchemeMap({ ...PACK, light: { seedColor: '#ffff00' } }, 'light').onPrimary).toBe('#000000')
    // Containers derive from the seed, not the baseline blue.
    expect(scheme.primaryContainer).not.toBe('#cfe8ff')
    // The un-mapped roles keep the baseline.
    expect(scheme.error).toBe('#ff383c')
  })

  test('a dark-theme pack seed keeps white onPrimary for a dark seed', () => {
    const pack = { ...PACK, dark: { seedColor: '#1b5e20' } }
    const scheme = pluginColorSchemeMap(pack, 'dark')
    expect(scheme.primary).toBe('#1b5e20')
    expect(scheme.onPrimary).toBe('#ffffff')
  })

  test('a pack background/surface pair moves the page/card groups', () => {
    const pack = { ...PACK, light: { backgroundColor: '#fdf6e3', surfaceColor: '#eee8d5' } }
    const scheme = pluginColorSchemeMap(pack, 'light')
    expect(scheme.surface).toBe('#fdf6e3')
    expect(scheme.surfaceContainer).toBe('#eee8d5')
    // The ladder surrounds the card colour: low is lighter, high/highest darker.
    expect(scheme.surfaceContainerLow).not.toBe(scheme.surfaceContainerHigh)
    expect(scheme.surfaceContainerHighest).not.toBe(scheme.surfaceContainer)
  })

  test('invalid pack colours fall back field-by-field, never whole-pack', () => {
    const pack = {
      ...PACK,
      light: { seedColor: 'not-a-color', backgroundColor: '#ff0000' },
    }
    const scheme = pluginColorSchemeMap(pack, 'light')
    // Bad seed keeps the baseline accent; the good background still applies.
    expect(scheme.primary).toBe('#0088ff')
    expect(scheme.surface).toBe('#ff0000')
  })

  test('the light/dark baselines are genuinely distinct palettes', () => {
    const light = pluginColorSchemeMap(null, 'light')
    const dark = pluginColorSchemeMap(null, 'dark')
    expect(light.surface).not.toBe(dark.surface)
    expect(light.primary).not.toBe(dark.primary)
    // The inverted pair really is inverted across themes.
    expect(light.inverseSurface).toBe(dark.onInverseSurface)
    expect(dark.inverseSurface).toBe(light.onInverseSurface)
  })
})
