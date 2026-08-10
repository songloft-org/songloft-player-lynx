import { describe, expect, test } from 'vitest'

import {
  arbToI18next,
  complexKeys,
  convertPlaceholders,
  hasIcuComplexPlaceholder,
  isArbMetaKey,
} from '../arb-to-i18next.js'

describe('isArbMetaKey', () => {
  test('flags @-prefixed metadata keys (incl. @@locale)', () => {
    expect(isArbMetaKey('@navHome')).toBe(true)
    expect(isArbMetaKey('@@locale')).toBe(true)
    expect(isArbMetaKey('navHome')).toBe(false)
  })
})

describe('convertPlaceholders', () => {
  test('rewrites single-brace {name} → double-brace {{name}}', () => {
    expect(convertPlaceholders('Hello {name}')).toBe('Hello {{name}}')
    expect(convertPlaceholders('{a} and {b}')).toBe('{{a}} and {{b}}')
  })

  test('leaves plain text untouched', () => {
    expect(convertPlaceholders('Now Playing')).toBe('Now Playing')
  })

  test('does not touch ICU plural/select blocks (comma after identifier)', () => {
    const icu = '{count, plural, one{1 song} other{{count} songs}}'
    // The inner simple `{count}` is still rewritten, but the ICU wrapper survives.
    expect(convertPlaceholders(icu)).toContain('{count, plural,')
  })
})

describe('hasIcuComplexPlaceholder', () => {
  test('detects plural/select/selectordinal blocks', () => {
    expect(hasIcuComplexPlaceholder('{count, plural, other{x}}')).toBe(true)
    expect(hasIcuComplexPlaceholder('{g, select, male{he} other{they}}')).toBe(true)
    expect(hasIcuComplexPlaceholder('just {name}')).toBe(false)
  })
})

describe('arbToI18next', () => {
  test('drops @meta keys, keeps messages, rewrites their placeholders', () => {
    const arb = {
      '@@locale': 'en',
      navHome: 'Home',
      '@navHome': { description: 'nav label' },
      greeting: 'Hi {name}',
      '@greeting': { placeholders: { name: { type: 'String' } } },
      count: 42, // non-string → skipped
    }
    expect(arbToI18next(arb)).toEqual({
      navHome: 'Home',
      greeting: 'Hi {{name}}',
    })
  })
})

describe('complexKeys', () => {
  test('lists message keys whose value still holds an ICU plural/select block', () => {
    const arb = {
      simple: 'Hi {name}',
      counted: '{count, plural, one{1} other{{count}}}',
      '@counted': { placeholders: { count: { type: 'int' } } },
    }
    expect(complexKeys(arb)).toEqual(['counted'])
  })
})
