import { describe, expect, test } from 'vitest'

import {
  type FontScaleOption,
  FONT_SCALE_OPTIONS,
  coerceFontScale,
  fontScaleValue,
} from '../font-scale-model.js'

describe('coerceFontScale', () => {
  test.each(FONT_SCALE_OPTIONS)('accepts "%s"', (v) => {
    expect(coerceFontScale(v)).toBe(v)
  })

  test.each([null, undefined, '', 'bogus', 'huge', 'DEFAULT'])(
    'coerces %j to "default"',
    (v) => {
      expect(coerceFontScale(v as string | null | undefined)).toBe('default')
    },
  )
})

describe('fontScaleValue', () => {
  test('small is 0.85', () => {
    expect(fontScaleValue('small')).toBe(0.85)
  })
  test('default is 1', () => {
    expect(fontScaleValue('default')).toBe(1)
  })
  test('large is 1.15', () => {
    expect(fontScaleValue('large')).toBe(1.15)
  })
  test('xlarge is 1.3', () => {
    expect(fontScaleValue('xlarge')).toBe(1.3)
  })
})

describe('FONT_SCALE_OPTIONS', () => {
  test('contains exactly four options', () => {
    const expected: FontScaleOption[] = ['small', 'default', 'large', 'xlarge']
    expect([...FONT_SCALE_OPTIONS]).toEqual(expected)
  })
})
