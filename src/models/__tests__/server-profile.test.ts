import { describe, expect, test } from 'vitest'

import { ServerProfile, ServerProfileList } from '../server-profile.js'

describe('ServerProfile schema', () => {
  test('parses valid input with snake_case transform', () => {
    const result = ServerProfile.parse({
      id: 'srv_1',
      name: 'Home',
      url: 'http://192.168.1.10:58091',
      insecure_tls: true,
      last_used: 1700000000000,
    })
    expect(result).toEqual({
      id: 'srv_1',
      name: 'Home',
      url: 'http://192.168.1.10:58091',
      insecureTls: true,
      lastUsed: 1700000000000,
    })
  })

  test('insecure_tls defaults to false when missing', () => {
    const result = ServerProfile.parse({
      id: 'srv_2',
      name: 'Work',
      url: 'https://work.example.com',
    })
    expect(result.insecureTls).toBe(false)
    expect(result.lastUsed).toBeUndefined()
  })

  test('safeParse rejects missing required fields', () => {
    const result = ServerProfile.safeParse({ id: 'x' })
    expect(result.success).toBe(false)
  })
})

describe('ServerProfileList schema', () => {
  test('parses an array of profiles', () => {
    const result = ServerProfileList.parse([
      { id: 'a', name: 'A', url: 'http://a', insecure_tls: false },
      { id: 'b', name: 'B', url: 'http://b', insecure_tls: true, last_used: 123 },
    ])
    expect(result).toHaveLength(2)
    expect(result[0].insecureTls).toBe(false)
    expect(result[1].insecureTls).toBe(true)
    expect(result[1].lastUsed).toBe(123)
  })

  test('empty array is valid', () => {
    const result = ServerProfileList.parse([])
    expect(result).toEqual([])
  })
})
