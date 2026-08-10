import { describe, expect, test } from 'vitest'

import { currentGreetingKey, greetingKeyForHour } from '../domain/greeting.js'

describe('greetingKeyForHour (pure)', () => {
  test('late night (< 6) → night key', () => {
    expect(greetingKeyForHour(0)).toBe('home.greetingNight')
    expect(greetingKeyForHour(5)).toBe('home.greetingNight')
  })

  test('morning (6–11) → morning key', () => {
    expect(greetingKeyForHour(6)).toBe('home.greetingMorning')
    expect(greetingKeyForHour(11)).toBe('home.greetingMorning')
  })

  test('midday/afternoon (12–17) → afternoon key', () => {
    expect(greetingKeyForHour(12)).toBe('home.greetingAfternoon')
    expect(greetingKeyForHour(17)).toBe('home.greetingAfternoon')
  })

  test('evening (>= 18) → evening key', () => {
    expect(greetingKeyForHour(18)).toBe('home.greetingEvening')
    expect(greetingKeyForHour(23)).toBe('home.greetingEvening')
  })
})

describe('currentGreetingKey', () => {
  test('uses the provided Date local hour', () => {
    const d = new Date()
    d.setHours(9, 0, 0, 0)
    expect(currentGreetingKey(d)).toBe('home.greetingMorning')
    d.setHours(20, 0, 0, 0)
    expect(currentGreetingKey(d)).toBe('home.greetingEvening')
  })
})
