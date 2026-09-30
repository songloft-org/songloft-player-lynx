import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

/**
 * The `appearance` half of the `songloft-theme` push — the payload that makes
 * a WebView plugin's mini-player mirror THIS host's chrome. These tests pin
 * the contract both ends depend on:
 *
 *  - `navigationStyle` is **constant 'capsule'`** — this client has no
 *    standard bottom bar to mirror, and a pack that says `standard` is
 *    describing the Flutter host, not this one. If this regresses to reading
 *    the pack field, a pack activated from the Flutter client would flip
 *    plugin pages to a bar layout this host never renders.
 *  - radii fall back to THIS client's baseline (not Flutter's defaults), and
 *    a pack's radii win when in range / are dropped when out of it.
 *  - the glass pair is `rgba(...)` — the WebView SDK's `common.js` validates
 *    glass colours against an rgba regex and silently drops anything else,
 *    so a hex here would degrade the plugin to opaque M3 roles with no
 *    error anywhere.
 *
 * The material/model modules are mocked so the pack-variant axis (glass
 * alpha per variant) stays out of these tests — its own gate tests cover it.
 */
vi.mock('../../../shared/theme/material-model.js', () => ({
  getMaterialVariant: () => 'regular',
}))

import { pluginThemeAppearance } from '../domain/plugin-theme-appearance.js'

const PACK = {
  id: 'p1',
  name: 'Pack',
  author: 'a',
  description: 'd',
  version: '1',
  schemaVersion: 1,
}

describe('pluginThemeAppearance', () => {
  beforeEach(() => {})

  afterEach(() => {
    vi.clearAllMocks()
  })

  test('navigationStyle is always capsule — this host has no standard bar', () => {
    // Even a pack that explicitly asks for standard (the Flutter host's
    // layout): it cannot change what this client renders.
    const standardPack = { ...PACK, navigationStyle: 'standard' }
    expect(pluginThemeAppearance(standardPack, 'light').navigationStyle).toBe('capsule')
    expect(pluginThemeAppearance(null, 'dark').navigationStyle).toBe('capsule')
  })

  test('no pack → this client’s own baseline radii', () => {
    const app = pluginThemeAppearance(null, 'light')
    // Mirrors PACK_OVERRIDABLE_BASELINE --radius-lg / --radius-md / --radius-nav.
    expect(app.cardRadius).toBe(20)
    expect(app.controlRadius).toBe(12)
    expect(app.navigationRadius).toBe(12)
  })

  test('a pack’s radii win when in the schema range', () => {
    const app = pluginThemeAppearance({ ...PACK, cardRadius: 28, controlRadius: 8 }, 'dark')
    expect(app.cardRadius).toBe(28)
    expect(app.controlRadius).toBe(8)
    // Unset fields keep the baseline rather than 0/undefined.
    expect(app.navigationRadius).toBe(12)
  })

  test('out-of-range pack radii fall back to the baseline, never NaN', () => {
    const app = pluginThemeAppearance({ ...PACK, cardRadius: 400, controlRadius: -5 }, 'light')
    expect(app.cardRadius).toBe(20)
    expect(app.controlRadius).toBe(12)
  })

  test('glass colours are rgba(...) strings for both themes', () => {
    // common.js drops non-rgba glass values silently — the format IS the contract.
    for (const resolved of ['light', 'dark'] as const) {
      const app = pluginThemeAppearance(PACK, resolved)
      expect(app.glassFill).toMatch(/^rgba\(\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)\s*\)$/)
      expect(app.glassBorder).toMatch(/^rgba\(\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)\s*\)$/)
    }
  })

  test('glass colours track the material variant tokens (dark ≠ light fill)', () => {
    const light = pluginThemeAppearance(null, 'light')
    const dark = pluginThemeAppearance(null, 'dark')
    // The baseline regular variant: light fill is white-based, dark is (23,23,27)-based.
    expect(light.glassFill).toBe('rgba(255, 255, 255, 0.85)')
    expect(dark.glassFill).toBe('rgba(23, 23, 27, 0.85)')
  })

  test('playerGradient is never part of the payload', () => {
    const app = pluginThemeAppearance({ ...PACK, playerGradient: ['#112233', '#445566'] }, 'light')
    expect('playerGradient' in app).toBe(false)
  })
})
