import { describe, expect, test } from 'vitest'

import { evaluateAuthGuard } from '../store/guard.js'

/**
 * The route-guard policy as a pure function: status × target-route →
 * allow (`null`) / redirect. Mirrors the Flutter GoRouter `redirect`.
 */
describe('evaluateAuthGuard', () => {
  test('unknown never redirects (waits for checkAuth)', () => {
    expect(evaluateAuthGuard('unknown', '/login')).toBeNull()
    expect(evaluateAuthGuard('unknown', '/')).toBeNull()
    expect(evaluateAuthGuard('unknown', '/library')).toBeNull()
  })

  test('unauthenticated on a protected route redirects to /login', () => {
    expect(evaluateAuthGuard('unauthenticated', '/')).toBe('/login')
    expect(evaluateAuthGuard('unauthenticated', '/library')).toBe('/login')
    expect(evaluateAuthGuard('unauthenticated', '/settings')).toBe('/login')
  })

  test('unauthenticated already on /login stays', () => {
    expect(evaluateAuthGuard('unauthenticated', '/login')).toBeNull()
  })

  test('authenticated on /login redirects home', () => {
    expect(evaluateAuthGuard('authenticated', '/login')).toBe('/')
  })

  test('authenticated on a protected route stays', () => {
    expect(evaluateAuthGuard('authenticated', '/')).toBeNull()
    expect(evaluateAuthGuard('authenticated', '/library')).toBeNull()
  })
})
