import { expect, test } from 'vitest'
import { MATERIAL_TOKENS, resolveMaterialTokens } from '../material-tokens.js'

const variants = ['ultra-thin', 'thin', 'regular', 'thick'] as const
const alpha = (value: string) => Number(value.slice(value.lastIndexOf(',') + 1, -1))

test.each(['light', 'dark'] as const)('%s native tint preserves thickness order and bounded values', theme => {
  const textures = variants.map(variant => resolveMaterialTokens({
    variant, theme, nativeGlass: true, increaseContrast: false,
  }))
  for (const key of ['--material-fill', '--material-fill-elevated'] as const) {
    const values = textures.map(texture => alpha(texture[key]))
    for (let i = 1; i < values.length; i++) expect(values[i]).toBeGreaterThan(values[i - 1]!)
  }
  for (const texture of textures) {
    expect(Object.keys(texture)).toHaveLength(4)
    for (const value of Object.values(texture)) {
      expect(alpha(value)).toBeGreaterThanOrEqual(0)
      expect(alpha(value)).toBeLessThanOrEqual(1)
    }
  }
})

test.each(['light', 'dark'] as const)('%s standard material preferences remain unchanged', theme => {
  for (const variant of variants) {
    for (const increaseContrast of [true, false]) {
      expect(resolveMaterialTokens({ variant, theme, nativeGlass: false, increaseContrast }))
        .toEqual(MATERIAL_TOKENS[increaseContrast ? 'thick' : variant][theme])
    }
  }
})
