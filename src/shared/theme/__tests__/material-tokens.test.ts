import { describe, expect, test } from 'vitest'

import { MATERIAL_TOKENS } from '../material-tokens.js'
import { PACK_OVERRIDABLE_BASELINE } from '../theme-pack-mapping.js'

const GLASS_KEYS = [
  '--glass-fill',
  '--glass-fill-strong',
  '--glass-border',
  '--glass-highlight',
] as const

describe('material-tokens', () => {
  test('regular variant matches PACK_OVERRIDABLE_BASELINE for both themes', () => {
    for (const theme of ['light', 'dark'] as const) {
      for (const key of GLASS_KEYS) {
        expect(
          MATERIAL_TOKENS.regular[theme][key],
          `regular.${theme}.${key}`,
        ).toBe(PACK_OVERRIDABLE_BASELINE[theme][key])
      }
    }
  })

  test('glass-fill alpha increases monotonically from ultra-thin to thick', () => {
    const order = ['ultra-thin', 'thin', 'regular', 'thick'] as const
    for (const theme of ['light', 'dark'] as const) {
      for (const key of ['--glass-fill', '--glass-fill-strong'] as const) {
        const alphas = order.map((v) => {
          const m = MATERIAL_TOKENS[v][theme][key].match(
            /[\d.]+\s*\)$/,
          )
          return parseFloat(m![0])
        })
        for (let i = 1; i < alphas.length; i++) {
          expect(
            alphas[i],
            `${theme}.${key}: ${order[i]} (${alphas[i]}) > ${order[i - 1]} (${alphas[i - 1]})`,
          ).toBeGreaterThan(alphas[i - 1]!)
        }
      }
    }
  })

  test('all four variants define all four glass keys for both themes', () => {
    for (const variant of ['ultra-thin', 'thin', 'regular', 'thick'] as const) {
      for (const theme of ['light', 'dark'] as const) {
        for (const key of GLASS_KEYS) {
          expect(
            MATERIAL_TOKENS[variant][theme][key],
            `${variant}.${theme}.${key}`,
          ).toBeTruthy()
        }
      }
    }
  })
})
