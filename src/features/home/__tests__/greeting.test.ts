import { describe, expect, test } from 'vitest'

import { currentGreeting, greetingForHour } from '../domain/greeting.js'

describe('greetingForHour (pure)', () => {
  test('late night (< 6) → Good night', () => {
    expect(greetingForHour(0)).toBe('Good night')
    expect(greetingForHour(5)).toBe('Good night')
  })

  test('morning (6–11) → Good morning', () => {
    expect(greetingForHour(6)).toBe('Good morning')
    expect(greetingForHour(11)).toBe('Good morning')
  })

  test('midday/afternoon (12–17) → Good afternoon', () => {
    expect(greetingForHour(12)).toBe('Good afternoon')
    expect(greetingForHour(17)).toBe('Good afternoon')
  })

  test('evening (>= 18) → Good evening', () => {
    expect(greetingForHour(18)).toBe('Good evening')
    expect(greetingForHour(23)).toBe('Good evening')
  })
})

describe('currentGreeting', () => {
  test('uses the provided Date local hour', () => {
    const d = new Date()
    d.setHours(9, 0, 0, 0)
    expect(currentGreeting(d)).toBe('Good morning')
    d.setHours(20, 0, 0, 0)
    expect(currentGreeting(d)).toBe('Good evening')
  })
})
