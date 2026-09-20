import { afterEach, describe, expect, test } from 'vitest'

import { createMemoryStorage } from '../../../core/storage/index.js'
import {
  type MaterialVariant,
  MATERIAL_VARIANT_OPTIONS,
  PREF_MATERIAL,
  applySavedMaterial,
  changeMaterialVariant,
  coerceMaterialVariant,
  getMaterialVariant,
  readSavedMaterial,
  subscribeMaterialVariant,
} from '../material-model.js'
import { MATERIAL_TOKENS } from '../material-tokens.js'
import {
  PACK_OVERRIDABLE_BASELINE,
  themePackToStyleVars,
} from '../theme-pack-mapping.js'

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Extract the trailing alpha number from an `rgba(r, g, b, alpha)` string. */
function extractAlpha(rgba: string): number {
  const m = rgba.match(/[\d.]+\s*\)$/)
  expect(m, `expected rgba alpha in "${rgba}"`).not.toBeNull()
  return parseFloat(m![0])
}

const GLASS_KEYS = [
  '--material-fill',
  '--material-fill-elevated',
  '--material-border',
  '--material-highlight',
] as const

const VARIANTS: readonly MaterialVariant[] = [
  'ultra-thin',
  'thin',
  'regular',
  'thick',
]

// Reset module-level material variant between tests so state cannot leak.
afterEach(async () => {
  await changeMaterialVariant('regular', createMemoryStorage())
})

// ── §1 coerceMaterialVariant (pure) ─────────────────────────────────────────

describe('coerceMaterialVariant', () => {
  test.each(MATERIAL_VARIANT_OPTIONS)('accepts "%s"', (v) => {
    expect(coerceMaterialVariant(v)).toBe(v)
  })

  test.each([null, undefined, '', 'bogus', 'REGULAR', 'Regular'])(
    'coerces %j to "regular"',
    (v) => {
      expect(coerceMaterialVariant(v as string | null | undefined)).toBe(
        'regular',
      )
    },
  )
})

describe('MATERIAL_VARIANT_OPTIONS', () => {
  test('contains exactly the four HIG variants', () => {
    const expected: MaterialVariant[] = [
      'ultra-thin',
      'thin',
      'regular',
      'thick',
    ]
    expect([...MATERIAL_VARIANT_OPTIONS]).toEqual(expected)
  })
})

// ── §2 四档取值表完整性 ─────────────────────────────────────────────────────

describe('MATERIAL_TOKENS completeness and monotonicity', () => {
  test('every variant defines all four glass keys for both themes as rgba()', () => {
    for (const variant of VARIANTS) {
      for (const theme of ['light', 'dark'] as const) {
        for (const key of GLASS_KEYS) {
          const val = MATERIAL_TOKENS[variant][theme][key]
          expect(val, `${variant}.${theme}.${key} must be non-empty`).toBeTruthy()
          expect(val, `${variant}.${theme}.${key} must be rgba()`).toMatch(
            /^rgba\(\d/,
          )
        }
      }
    }
  })

  test('fill alpha increases monotonically: ultra-thin < thin < regular < thick', () => {
    for (const theme of ['light', 'dark'] as const) {
      for (const key of [
        '--material-fill',
        '--material-fill-elevated',
      ] as const) {
        const alphas = VARIANTS.map((v) =>
          extractAlpha(MATERIAL_TOKENS[v][theme][key]),
        )
        for (let i = 1; i < alphas.length; i++) {
          expect(
            alphas[i],
            `${theme}.${key}: ${VARIANTS[i]} (${alphas[i]}) > ${VARIANTS[i - 1]} (${alphas[i - 1]})`,
          ).toBeGreaterThan(alphas[i - 1]!)
        }
      }
    }
  })

  test('fill-elevated alpha < fill alpha for each variant and theme', () => {
    for (const variant of VARIANTS) {
      for (const theme of ['light', 'dark'] as const) {
        const fillAlpha = extractAlpha(
          MATERIAL_TOKENS[variant][theme]['--material-fill'],
        )
        const elevatedAlpha = extractAlpha(
          MATERIAL_TOKENS[variant][theme]['--material-fill-elevated'],
        )
        expect(
          elevatedAlpha,
          `${variant}.${theme}: elevated (${elevatedAlpha}) < fill (${fillAlpha})`,
        ).toBeLessThan(fillAlpha)
      }
    }
  })
})

// ── §3 默认变体为 regular ───────────────────────────────────────────────────

describe('default variant', () => {
  test('getMaterialVariant() returns "regular" by default', () => {
    expect(getMaterialVariant()).toBe('regular')
  })
})

// ── §4 PACK_OVERRIDABLE_BASELINE 基线锚定 regular ──────────────────────────

describe('baseline anchoring to regular', () => {
  test('PACK_OVERRIDABLE_BASELINE material keys == MATERIAL_TOKENS["regular"]', () => {
    for (const theme of ['light', 'dark'] as const) {
      for (const key of GLASS_KEYS) {
        expect(
          PACK_OVERRIDABLE_BASELINE[theme][key],
          `baseline.${theme}.${key} must match regular`,
        ).toBe(MATERIAL_TOKENS.regular[theme][key])
      }
    }
  })
})

// ── §5 getMaterialVariant / subscribe / persist ─────────────────────────────

describe('material model lifecycle', () => {
  test('changeMaterialVariant switches the live value', async () => {
    const storage = createMemoryStorage()
    await changeMaterialVariant('thin', storage)
    expect(getMaterialVariant()).toBe('thin')
    await changeMaterialVariant('thick', storage)
    expect(getMaterialVariant()).toBe('thick')
  })

  test('subscribe fires on change, not on same-value set', async () => {
    const storage = createMemoryStorage()
    let calls = 0
    const unsub = subscribeMaterialVariant(() => {
      calls++
    })

    await changeMaterialVariant('thin', storage)
    expect(calls).toBe(1)

    // Same value → setLive no-ops → no notify.
    await changeMaterialVariant('thin', storage)
    expect(calls).toBe(1)

    await changeMaterialVariant('thick', storage)
    expect(calls).toBe(2)

    unsub()
    await changeMaterialVariant('ultra-thin', storage)
    expect(calls).toBe(2) // unsubscribed
  })

  test('persists non-default and removes default ("regular")', async () => {
    const storage = createMemoryStorage()

    await changeMaterialVariant('thick', storage)
    expect(await storage.prefs.get(PREF_MATERIAL)).toBe('thick')

    // Switching back to regular removes the key — absent == default.
    await changeMaterialVariant('regular', storage)
    expect(await storage.prefs.get(PREF_MATERIAL)).toBeNull()
  })

  test('readSavedMaterial reads from storage and coerces bad values', async () => {
    const storage = createMemoryStorage()
    // Nothing persisted → regular.
    expect(await readSavedMaterial(storage)).toBe('regular')

    await storage.prefs.set(PREF_MATERIAL, 'thin')
    expect(await readSavedMaterial(storage)).toBe('thin')

    // Garbage → coerced to regular.
    await storage.prefs.set(PREF_MATERIAL, 'bogus')
    expect(await readSavedMaterial(storage)).toBe('regular')
  })

  test('applySavedMaterial restores persisted variant to live state', async () => {
    const storage = createMemoryStorage()
    await storage.prefs.set(PREF_MATERIAL, 'ultra-thin')

    const result = await applySavedMaterial(storage)
    expect(result).toBe('ultra-thin')
    expect(getMaterialVariant()).toBe('ultra-thin')
  })

  test('applySavedMaterial defaults to regular when nothing persisted', async () => {
    const storage = createMemoryStorage()
    const result = await applySavedMaterial(storage)
    expect(result).toBe('regular')
    expect(getMaterialVariant()).toBe('regular')
  })
})

// ── §6 themePackToStyleVars: key-set invariant + variant sensitivity ────────

describe('themePackToStyleVars variant integration', () => {
  test('key set is constant regardless of which variant is active', async () => {
    const storage = createMemoryStorage()
    const sortedKeys = (vars: Record<string, string>) =>
      Object.keys(vars).sort()

    await changeMaterialVariant('regular', storage)
    const regularKeysLight = sortedKeys(themePackToStyleVars(null, 'light'))

    for (const variant of ['ultra-thin', 'thin', 'thick'] as const) {
      await changeMaterialVariant(variant, storage)
      expect(
        sortedKeys(themePackToStyleVars(null, 'light')),
        `light keys with ${variant} must match regular`,
      ).toEqual(regularKeysLight)
      expect(
        sortedKeys(themePackToStyleVars(null, 'dark')),
        `dark keys with ${variant} must match regular (light)`,
      ).toEqual(regularKeysLight)
    }
  })

  test('material keys track the selected variant exactly', async () => {
    const storage = createMemoryStorage()
    for (const variant of VARIANTS) {
      await changeMaterialVariant(variant, storage)
      for (const theme of ['light', 'dark'] as const) {
        const vars = themePackToStyleVars(null, theme)
        for (const key of GLASS_KEYS) {
          expect(
            vars[key],
            `${variant}.${theme}.${key}`,
          ).toBe(MATERIAL_TOKENS[variant][theme][key])
        }
      }
    }
  })

  test('non-material keys are unaffected by variant switch', async () => {
    const storage = createMemoryStorage()
    // Snapshot baseline at regular.
    await changeMaterialVariant('regular', storage)
    const baselineLight = themePackToStyleVars(null, 'light')
    const baselineDark = themePackToStyleVars(null, 'dark')

    const nonMaterialKeys = Object.keys(baselineLight).filter(
      (k) => !(GLASS_KEYS as readonly string[]).includes(k),
    )
    // Sanity: there must be many non-material keys (accent, background, radius…).
    expect(nonMaterialKeys.length).toBeGreaterThan(10)

    for (const variant of ['ultra-thin', 'thin', 'thick'] as const) {
      await changeMaterialVariant(variant, storage)
      const lightVars = themePackToStyleVars(null, 'light')
      const darkVars = themePackToStyleVars(null, 'dark')
      for (const key of nonMaterialKeys) {
        expect(
          lightVars[key],
          `light.${key} unchanged with ${variant}`,
        ).toBe(baselineLight[key])
        expect(darkVars[key], `dark.${key} unchanged with ${variant}`).toBe(
          baselineDark[key],
        )
      }
    }
  })
})
