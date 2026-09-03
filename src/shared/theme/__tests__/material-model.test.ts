import { describe, expect, test } from 'vitest'

import {
  type MaterialVariant,
  MATERIAL_VARIANT_OPTIONS,
  coerceMaterialVariant,
} from '../material-model.js'

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
