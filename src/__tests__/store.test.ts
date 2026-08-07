import { afterEach, describe, expect, test } from 'vitest'

import { useAppSessionStore } from '../store/index.js'

/**
 * Exercises the store via its vanilla API (getState/setState/subscribe) — no
 * React render — so it validates the Zustand base convention works when merely
 * imported and mutated, independent of the ReactLynx reconciler.
 */
describe('app session store', () => {
  afterEach(() => {
    useAppSessionStore.getState().reset()
  })

  test('exposes initial state and actions', () => {
    const state = useAppSessionStore.getState()
    expect(typeof state.baseUrl).toBe('string')
    expect(state.username).toBeNull()
  })

  test('setters update state', () => {
    useAppSessionStore.getState().setBaseUrl('http://server:1234')
    useAppSessionStore.getState().setUsername('admin')
    expect(useAppSessionStore.getState().baseUrl).toBe('http://server:1234')
    expect(useAppSessionStore.getState().username).toBe('admin')
  })

  test('subscribe fires on change', () => {
    let calls = 0
    const unsub = useAppSessionStore.subscribe(() => {
      calls++
    })
    useAppSessionStore.getState().setUsername('x')
    unsub()
    useAppSessionStore.getState().setUsername('y')
    expect(calls).toBe(1)
  })
})
