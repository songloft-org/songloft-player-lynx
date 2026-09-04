import { readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, test } from 'vitest'

import {
  hexToRgba,
  isHexColor,
  PACK_OVERRIDABLE_BASELINE,
  readableTextColorOn,
  themePackToStyleVars,
  type ThemePackData,
} from '../theme-pack-mapping.js'

/**
 * The mapping is the whole feature: a pack's Material-flavoured JSON becoming
 * Muse tokens. These tests pin the field→token table in the module header —
 * especially the parts with a *reason* behind them (derived on-accent, the
 * 90% translucent paper, playerGradient being dropped).
 *
 * The mapping always returns the FULL overridable key set with valid values:
 * the runtime's style diffs merge and never remove, so "clear the pack" must be
 * a write-back-to-baseline, not a dropped attribute. The tests below assert
 * that invariant wherever it could regress.
 */

/** The real `songloft.sakura` pack from the local dev database. */
const SAKURA: ThemePackData = {
  id: 'songloft.sakura',
  name: 'Sakura',
  author: 'Songloft',
  description: 'A warm cherry-blossom theme with pink accents',
  version: '1.0.0',
  schemaVersion: 1,
  light: { seedColor: '#D81B60', backgroundColor: '#FFF0F5', surfaceColor: '#FFFFFF' },
  dark: { seedColor: '#F48FB1', backgroundColor: '#1A0A10', surfaceColor: '#261418' },
  playerGradient: ['#880E4F', '#4A148C'],
  cardRadius: 14,
  controlRadius: 16,
  navigationRadius: 14,
}

describe('isHexColor', () => {
  test.each(['#D81B60', '#d81b60'])('accepts #RRGGBB (%s)', value => {
    expect(isHexColor(value)).toBe(true)
  })

  test.each([
    'D81B60',      // missing #
    '#D81B6',      // 5 digits
    '#D81B60A',    // 7 digits
    '#D81B6G',     // non-hex letter
    '',            // empty
    null,          // not a string
    42,
  ])('rejects %p', value => {
    expect(isHexColor(value)).toBe(false)
  })
})

describe('readableTextColorOn', () => {
  test('light seeds get dark text', () => {
    // Sakura's dark-mode seed — a light pink (YIQ ≈ 177).
    expect(readableTextColorOn('#F48FB1')).toBe('#000000')
    expect(readableTextColorOn('#FFF0F5')).toBe('#000000')
  })

  test('dark seeds get white text', () => {
    // Sakura's light-mode seed (YIQ ≈ 91) and a deep purple-red (≈ 58).
    expect(readableTextColorOn('#D81B60')).toBe('#ffffff')
    expect(readableTextColorOn('#880E4F')).toBe('#ffffff')
  })
})

describe('hexToRgba', () => {
  test('expands to rgba with the given alpha', () => {
    expect(hexToRgba('#FFFFFF', 0.9)).toBe('rgba(255, 255, 255, 0.9)')
    expect(hexToRgba('#261418', 0.9)).toBe('rgba(38, 20, 24, 0.9)')
  })
})

describe('themePackToStyleVars', () => {

/** The full inline-style output themePackToStyleVars produces for a given theme
 * when no pack is active: the baseline plus the material glass tokens (always
 * injected, regular = baseline) and --font-scale (default 1). */
function expectBaseline(resolved: 'light' | 'dark'): Record<string, string> {
  return {
    ...PACK_OVERRIDABLE_BASELINE[resolved],
    '--font-scale': '1',
  }
}
  test('maps the full sakura pack in light mode', () => {
    const vars = themePackToStyleVars(SAKURA, 'light')

    // One accent channel now: the former --primary/--primary-2/--accent trio was
    // three names for the same ink shade, and --primary-2 had no consumer at all.
    expect(vars['--accent']).toBe('#D81B60')
    expect(vars['--accent-content']).toBe('#ffffff')
    // The accent wash derives from the seed: 10% in light mode, which now MATCHES
    // the baseline alpha in tokens.css rather than running two points above it.
    expect(vars['--tint-fill']).toBe('rgba(216, 27, 96, 0.1)')
    // Glass is INDEPENDENT of seed: sakura ships no glassColor, so the glass
    // glow falls back to the star-blue baseline — pink buttons + blue glass
    // (true dual-channel), NOT pink glass. The texture tokens stay baseline too.
    expect(vars['--glass-glow']).toBe(PACK_OVERRIDABLE_BASELINE.light['--glass-glow'])
    expect(vars['--glass-glow-faint']).toBe(PACK_OVERRIDABLE_BASELINE.light['--glass-glow-faint'])
    expect(vars['--glass-sheen']).toBe(PACK_OVERRIDABLE_BASELINE.light['--glass-sheen'])
    expect(vars['--glass-fill']).toBe(PACK_OVERRIDABLE_BASELINE.light['--glass-fill'])
    expect(vars['--glass-fill-strong']).toBe(PACK_OVERRIDABLE_BASELINE.light['--glass-fill-strong'])
    expect(vars['--glass-border']).toBe(PACK_OVERRIDABLE_BASELINE.light['--glass-border'])
    expect(vars['--glass-highlight']).toBe(PACK_OVERRIDABLE_BASELINE.light['--glass-highlight'])
    expect(vars['--system-background']).toBe('#FFF0F5')
    expect(vars['--secondary-system-background']).toBe('#FFFFFF')
    // The pack's single page/card pair drives BOTH Apple background groups. Apple
    // keeps them distinct, but a pack only supplies two colours — mapping only the
    // plain group would leave every settings-style page on the untouched Apple grey
    // while the rest of the app wore the pack.
    expect(vars['--system-grouped-background']).toBe('#FFF0F5')
    expect(vars['--secondary-system-grouped-background']).toBe('#FFFFFF')
    expect(vars['--paper-clear']).toBe('rgba(255, 255, 255, 0.9)')
    expect(vars['--radius-lg']).toBe('14px')
    expect(vars['--radius-md']).toBe('16px')
    expect(vars['--radius-nav']).toBe('14px')
  })

  test('selects the dark palette when resolved is dark', () => {
    const vars = themePackToStyleVars(SAKURA, 'dark')

    expect(vars['--accent']).toBe('#F48FB1')
    // The wash brightens to 18% in dark mode — a low-alpha tint over dark surfaces
    // needs more to stay visible. Mirrors the baseline's 10%/18% split exactly.
    expect(vars['--tint-fill']).toBe('rgba(244, 143, 177, 0.18)')
    // Glass falls back to the dark star-blue baseline (sakura has no glassColor).
    expect(vars['--glass-glow']).toBe(PACK_OVERRIDABLE_BASELINE.dark['--glass-glow'])
    expect(vars['--glass-glow-faint']).toBe(PACK_OVERRIDABLE_BASELINE.dark['--glass-glow-faint'])
    expect(vars['--glass-sheen']).toBe(PACK_OVERRIDABLE_BASELINE.dark['--glass-sheen'])
    expect(vars['--system-background']).toBe('#1A0A10')
    expect(vars['--secondary-system-background']).toBe('#261418')
    expect(vars['--system-grouped-background']).toBe('#1A0A10')
    expect(vars['--secondary-system-grouped-background']).toBe('#261418')
    expect(vars['--paper-clear']).toBe('rgba(38, 20, 24, 0.9)')
  })

  test('glassColor tints the glass independently of the seed (dual-channel)', () => {
    // A pack whose glass colour differs from its button colour: the glass
    // glow rides glassColor, the button/accent still rides seedColor — the
    // two channels never bleed into each other.
    const vars = themePackToStyleVars({
      ...SAKURA,
      light: {
        seedColor: '#D81B60', // pink buttons
        backgroundColor: '#FFF0F5',
        surfaceColor: '#FFFFFF',
        glassColor: '#3BAEEF', // blue glass
      },
    }, 'light')
    expect(vars['--accent']).toBe('#D81B60') // button channel = seed
    expect(vars['--accent']).toBe('#D81B60')
    expect(vars['--glass-glow']).toBe('#3BAEEF') // glass channel = glassColor
    expect(vars['--glass-glow-faint']).toBe('rgba(59, 174, 239, 0.1)')
    expect(vars['--glass-sheen']).toBe('rgba(59, 174, 239, 0.1)')
  })

  test('an invalid glassColor is dropped, glass falls back to baseline', () => {
    const vars = themePackToStyleVars({
      ...SAKURA,
      light: { seedColor: '#D81B60', glassColor: 'not-a-color' },
    }, 'light')
    expect(vars['--glass-glow']).toBe(PACK_OVERRIDABLE_BASELINE.light['--glass-glow'])
    // seedColor still applies to the button channel (invalid fields are
    // dropped field-by-field, never whole-pack).
    expect(vars['--accent']).toBe('#D81B60')
  })

  test('never emits playerGradient tokens', () => {
    // The Lynx player is a scrim-veil design with computed alphas
    // (`tokens.css`); a gradient would break the contrast gates.
    const vars = themePackToStyleVars(SAKURA, 'light')
    const keys = Object.keys(vars)
    expect(keys.filter(k => k.includes('gradient') || k.includes('scrim'))).toEqual([])
  })

  test('drops invalid colors field-by-field, keeping the baseline for those tokens', () => {
    const vars = themePackToStyleVars({
      ...SAKURA,
      light: { seedColor: '#D81B60', backgroundColor: 'not-a-color', surfaceColor: '#FFF' },
    }, 'light')

    expect(vars['--accent']).toBe('#D81B60')
    // Not "absent" — the baseline. Invalid fields must not leak through, but
    // the token still needs a value (style diffs never remove keys).
    expect(vars['--system-background']).toBe(PACK_OVERRIDABLE_BASELINE.light['--system-background'])
    expect(vars['--secondary-system-background']).toBe(PACK_OVERRIDABLE_BASELINE.light['--secondary-system-background'])
    // The wash rides with the seed: valid seed keeps the derived wash even
    // when other colour fields are invalid.
    expect(vars['--tint-fill']).toBe('rgba(216, 27, 96, 0.1)')
    // Radii survive a partially-invalid colors block.
    expect(vars['--radius-lg']).toBe('14px')
  })

  test('an invalid seed drops the wash to the baseline', () => {
    const vars = themePackToStyleVars({
      ...SAKURA,
      light: { seedColor: 'not-a-color' },
    }, 'light')
    expect(vars['--tint-fill']).toBe(PACK_OVERRIDABLE_BASELINE.light['--tint-fill'])
  })

  test('radii outside the backend 0-100 range fall back to the baseline', () => {
    const vars = themePackToStyleVars({
      ...SAKURA,
      light: { seedColor: '#D81B60' },
      cardRadius: 101,
      controlRadius: -1,
      navigationRadius: NaN,
    }, 'light')

    expect(vars['--radius-lg']).toBe(PACK_OVERRIDABLE_BASELINE.light['--radius-lg'])
    expect(vars['--radius-md']).toBe(PACK_OVERRIDABLE_BASELINE.light['--radius-md'])
    expect(vars['--radius-nav']).toBe(PACK_OVERRIDABLE_BASELINE.light['--radius-nav'])
  })

  test('a pack with nothing for one brightness maps to that brightness baseline', () => {
    const darkOnly: ThemePackData = {
      ...SAKURA,
      light: undefined,
      cardRadius: undefined,
      controlRadius: undefined,
      navigationRadius: undefined,
    }
    expect(themePackToStyleVars(darkOnly, 'light')).toEqual(expectBaseline('light'))
    // …but still maps in dark mode.
    expect(themePackToStyleVars(darkOnly, 'dark')['--accent']).toBe('#F48FB1')
  })

  test('no pack at all is the full baseline, not undefined', () => {
    // The runtime merges style objects and never removes keys, so "clear the
    // pack" has to be a write-back-to-baseline rather than a dropped style.
    expect(themePackToStyleVars(null, 'light')).toEqual(expectBaseline('light'))
    expect(themePackToStyleVars(undefined, 'dark')).toEqual(expectBaseline('dark'))
  })

  test('the key set is constant across pack/no-pack and light/dark', () => {
    const keys = (v: Record<string, string>) => Object.keys(v).sort()
    expect(keys(themePackToStyleVars(SAKURA, 'light')))
      .toEqual(keys(themePackToStyleVars(null, 'light')))
    expect(keys(themePackToStyleVars(SAKURA, 'light')))
      .toEqual(keys(themePackToStyleVars(SAKURA, 'dark')))
  })

  test('a colors block whose every field is invalid yields the full baseline', () => {
    const vars = themePackToStyleVars({
      ...SAKURA,
      light: { seedColor: 'x', backgroundColor: 'y', surfaceColor: 'z' },
      cardRadius: undefined,
      controlRadius: undefined,
      navigationRadius: undefined,
    }, 'light')
    expect(vars).toEqual(expectBaseline('light'))
  })
})

describe('the baseline table mirrors tokens.css', () => {
  /**
   * `PACK_OVERRIDABLE_BASELINE` duplicates values from `tokens.css`. That is
   * deliberate (the runtime cannot read CSS back), but it means the two can
   * drift — a retuned Muse palette would silently stop matching the "no pack"
   * inline values. This gate parses the stylesheet and asserts the table
   * against the real declarations, `tokens-defined.test.ts`-style.
   */
  /** Extract `--key: value;` declarations from one CSS class block. */
  function blockDeclarations(source: string, selector: string): Record<string, string> {
    const match = source.match(new RegExp(`${selector.replace(/[.]/g, '\\.')}\\s*\\{([\\s\\S]*?)\\}`, 'm'))
    expect(match, `${selector} block exists`).toBeTruthy()
    const declared: Record<string, string> = {}
    for (const m of Array.from(match![1]!.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g))) {
      declared[m[1]!] = m[2]!.trim()
    }
    return declared
  }

  /**
   * Colours live in `.theme-root.theme-<x>` blocks; the radius scale is
   * brightness-independent and lives in the plain `.theme-root` block — the
   * union is what the pack can override.
   */
  function declarations(which: 'light' | 'dark'): Record<string, string> {
    const css = readFileSync(path.resolve(__dirname, '../tokens.css'), 'utf8')
    return {
      ...blockDeclarations(css, '.theme-root'),
      ...blockDeclarations(css, `.theme-root.theme-${which}`),
    }
  }

  test.each(['light', 'dark'] as const)('%s: every table entry matches the stylesheet', which => {
    const declared = declarations(which)
    for (const [token, value] of Object.entries(PACK_OVERRIDABLE_BASELINE[which]!)) {
      expect(declared[token], `${token} declared for .theme-${which}`).toBeDefined()
      expect(value, `${token} matches .theme-${which}`).toBe(declared[token])
    }
  })

  test('the table covers only tokens that exist in the stylesheet', () => {
    // A typo'd token key (e.g. `--primry`) would pass the match test above by
    // simply not being asserted; require every key to be a real declaration.
    for (const which of ['light', 'dark'] as const) {
      const declared = declarations(which)
      for (const token of Object.keys(PACK_OVERRIDABLE_BASELINE[which]!)) {
        expect(declared[token], `${token} is a real token`).toBeDefined()
      }
    }
  })
})
