import { describe, expect, test } from 'vitest'

import { extractLeadingNumber, numberAwareCompare, pinyinCompare } from '../pinyin-compare.js'

describe('pinyinCompare', () => {
  test('sorts ASCII strings correctly', () => {
    expect(pinyinCompare('apple', 'banana')).toBeLessThan(0)
    expect(pinyinCompare('banana', 'apple')).toBeGreaterThan(0)
    expect(pinyinCompare('apple', 'apple')).toBe(0)
  })

  test('case insensitive', () => {
    expect(pinyinCompare('Apple', 'apple')).toBe(0)
    expect(pinyinCompare('BANANA', 'banana')).toBe(0)
  })

  test('sorts Chinese characters (pinyin order if locale available)', () => {
    const items = ['张三', '李四', '王五', '赵六']
    const sorted = [...items].sort(pinyinCompare)
    expect(sorted.length).toBe(4)
    expect(sorted[0]).toBeDefined()
  })

  test('mixed Chinese and ASCII', () => {
    const items = ['Rock', '摇滚', 'Jazz', '爵士']
    const sorted = [...items].sort(pinyinCompare)
    expect(sorted.length).toBe(4)
  })
})

describe('extractLeadingNumber', () => {
  test('extracts number from start', () => {
    expect(extractLeadingNumber('04.校园故事')).toBe(4)
    expect(extractLeadingNumber('12 - Track Name')).toBe(12)
  })

  test('extracts number from middle', () => {
    expect(extractLeadingNumber('干得漂亮 | 01 好意被辜负')).toBe(1)
  })

  test('returns null for no number', () => {
    expect(extractLeadingNumber('No Numbers Here')).toBeNull()
    expect(extractLeadingNumber('abc')).toBeNull()
  })
})

describe('numberAwareCompare', () => {
  test('sorts numbered items by number first', () => {
    const items = ['03 Third', '01 First', '02 Second']
    const sorted = [...items].sort(numberAwareCompare)
    expect(sorted).toEqual(['01 First', '02 Second', '03 Third'])
  })

  test('numbered items come before non-numbered', () => {
    const result = numberAwareCompare('01 First', 'No Number')
    expect(result).toBeLessThan(0)
  })

  test('non-numbered items sort alphabetically', () => {
    const items = ['Banana', 'Apple', 'Cherry']
    const sorted = [...items].sort(numberAwareCompare)
    expect(sorted).toEqual(['Apple', 'Banana', 'Cherry'])
  })
})
