import { describe, expect, test } from 'vitest'

import { evaluateAuthGuard, isAuthTransitionPending } from '../store/guard.js'

test('unauthenticated local browsing is separate from authenticated server routes and requires a proven queue for playback', () => {
  expect(evaluateAuthGuard('unauthenticated', '/device-cache')).toBeNull()
  expect(isAuthTransitionPending('unauthenticated', '/device-cache')).toBe(false)
  expect(evaluateAuthGuard('unauthenticated', '/player')).toBe('/login')
  expect(evaluateAuthGuard('unauthenticated', '/player', true)).toBeNull()
  expect(evaluateAuthGuard('unauthenticated', '/player/eq', true)).toBeNull()
  for (const path of ['/', '/library', '/settings', '/settings/cache-tasks', '/player/dlna', '/player/video']) {
    expect(evaluateAuthGuard('unauthenticated', path, true)).toBe('/login')
  }
})

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

/**
 * The render-layer companion of the guard: when to hold the splash screen.
 * Pinned here because the whole point of the splash gate is that these two
 * *pending* cases must never paint a real route — `unknown` boots on memory
 * history's `/login` default, and a decided-but-not-yet-landed redirect sits
 * one promise-chain tick away from the target.
 */
describe('isAuthTransitionPending', () => {
  test('unknown is always pending (auth not resolved)', () => {
    expect(isAuthTransitionPending('unknown', '/login')).toBe(true)
    expect(isAuthTransitionPending('unknown', '/')).toBe(true)
    expect(isAuthTransitionPending('unknown', '/library')).toBe(true)
  })

  test('a decided redirect keeps the splash up until it lands', () => {
    // authenticated sitting on /login — the guard says redirect to '/'
    expect(isAuthTransitionPending('authenticated', '/login')).toBe(true)
    // unauthenticated on a protected route — the guard says redirect to /login
    expect(isAuthTransitionPending('unauthenticated', '/library')).toBe(true)
    expect(isAuthTransitionPending('unauthenticated', '/')).toBe(true)
  })

  test('settled pairs render normally', () => {
    expect(isAuthTransitionPending('unauthenticated', '/login')).toBe(false)
    expect(isAuthTransitionPending('authenticated', '/')).toBe(false)
    expect(isAuthTransitionPending('authenticated', '/library')).toBe(false)
  })
})
